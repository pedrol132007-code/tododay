import { FunctionsHttpError } from "@supabase/supabase-js";
import { must, supabase } from "./supabase";
import type { CardAttachment } from "../types";
import { checkNameAndSize, PROBLEM_TEXT, typeOfName } from "../lib/attachmentRules";

// Anexos (0011_attachments.sql): o arquivo vai direto ao Storage e a Edge Function "attachments"
// confere o conteúdo e grava os metadados. Ler é por URL assinada, que o Storage só gera para
// quem enxerga o card.

const BUCKET = "attachments";
/** Validade das URLs assinadas (miniaturas, abrir e baixar). */
export const SIGNED_URL_SECONDS = 300;

/** Erro para mostrar como veio (já em português). */
export class AttachmentError extends Error {}

export async function listAttachments(cardId: number): Promise<CardAttachment[]> {
  return must(await supabase.from("card_attachment").select("*").eq("card_id", cardId).order("created_at"));
}

/** Pede à Edge Function; erro dela vira AttachmentError com a mensagem que ela mandou. */
async function callFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("attachments", { body });
  if (error) {
    const message = error instanceof FunctionsHttpError ? ((await error.context.json().catch(() => null)) as { error?: string } | null)?.error : null;
    throw new AttachmentError(message ?? "Não foi possível falar com o servidor de anexos. Tente de novo.");
  }
  return data as T;
}

/** Sobe o arquivo para o Storage com progresso (o SDK não tem), cancelável pelo signal. */
function putObject(path: string, file: File, contentType: string, token: string, onProgress: (fraction: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // O Storage às vezes responde 400 com o código de verdade no corpo ("statusCode": "413").
      let code = xhr.status;
      try {
        code = Number(JSON.parse(xhr.responseText).statusCode) || code;
      } catch {
        // Corpo que não é JSON: fica o status HTTP.
      }
      if (code === 413) return reject(new AttachmentError(PROBLEM_TEXT.tooLarge));
      if (code === 415) return reject(new AttachmentError(PROBLEM_TEXT.type));
      if (code === 403) return reject(new AttachmentError("Você não pode anexar arquivos neste card."));
      reject(new AttachmentError("O envio falhou. Tente de novo."));
    };
    xhr.onerror = () => reject(new AttachmentError("Sem conexão com o servidor. Tente de novo."));
    xhr.onabort = () => reject(new DOMException("Envio cancelado", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/**
 * Envia um anexo: confere nome e tamanho aqui (para avisar antes de subir), sobe com um nome
 * uuid e pede à Edge Function para aprovar. Rejeita com AttachmentError (mensagem pronta) ou,
 * se cancelado, com AbortError.
 */
export async function uploadAttachment(
  cardId: number,
  file: File,
  { onProgress, signal }: { onProgress: (fraction: number) => void; signal: AbortSignal },
): Promise<CardAttachment> {
  const problem = checkNameAndSize(file.name, file.size);
  if (problem) throw new AttachmentError(PROBLEM_TEXT[problem]);
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new AttachmentError("Sua sessão expirou. Entre de novo.");

  const path = `${cardId}/${crypto.randomUUID()}`;
  // O tipo sai da extensão, não do navegador (que no Windows chama csv de "vnd.ms-excel").
  await putObject(path, file, typeOfName(file.name)!.mime, data.session.access_token, onProgress, signal);
  return callFunction<CardAttachment>({ action: "finalize", cardId, path, name: file.name });
}

export async function deleteAttachment(id: number): Promise<void> {
  must(await supabase.from("card_attachment").delete().eq("id", id));
  void purgeAttachmentTrash();
}

/**
 * Apaga do Storage o que foi para a lixeira (anexo excluído, card/coluna/board excluídos). Chamada
 * depois de cada exclusão; se falhar, fica para a próxima.
 */
export async function purgeAttachmentTrash(): Promise<void> {
  try {
    await callFunction({ action: "purge" });
  } catch {
    // A lixeira guarda o caminho até dar certo.
  }
}

/** URLs assinadas (ver e abrir), por caminho. */
export async function signAttachmentUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) throw error;
  return new Map(data.flatMap((r) => (r.path && r.signedUrl ? [[r.path, r.signedUrl] as const] : [])));
}

/** A mesma URL, mas baixando com o nome original (o Storage lê ?download=). */
export const downloadUrl = (signedUrl: string, name: string) => `${signedUrl}&download=${encodeURIComponent(name)}`;

/** O que o board precisa de cada anexo: contagem e tamanho por card, e a capa. */
export type AttachmentSummary = Pick<CardAttachment, "card_id" | "mime_type" | "storage_path" | "size_bytes" | "is_cover">;

/** Anexos de todos os cards do board, inclusive os arquivados (para os avisos de exclusão). */
export async function listBoardAttachments(boardId: number): Promise<AttachmentSummary[]> {
  return must(await supabase.from("card_attachment").select("card_id, mime_type, storage_path, size_bytes, is_cover").eq("board_id", boardId));
}

/** Anexos dos cards de uma coluna (os arquivados somem junto com ela). */
export async function listAttachmentsOfList(listId: number): Promise<Pick<CardAttachment, "size_bytes">[]> {
  return must(await supabase.from("card_attachment").select("size_bytes, card!inner(list_id)").eq("card.list_id", listId));
}

/** Liga a capa numa imagem do card; null tira a capa. */
export async function setCardCover(cardId: number, attachmentId: number | null): Promise<void> {
  must(await supabase.rpc("set_card_cover", { p_card_id: cardId, p_attachment_id: attachmentId }));
}
