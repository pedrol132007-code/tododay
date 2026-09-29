// GERADO por scripts/gen-attachments-function.mjs a partir de handler.ts e de src/lib/attachmentRules.ts.
// Não edite à mão: mude as fontes e rode npm run gen:function.

// Edge Function "attachments" (Deno, no Supabase). Fonte de verdade; o index.ts ao lado é gerado a
// partir deste arquivo com as regras embutidas (npm run gen:function), para colar no painel.
//
// Ações (POST, JSON, com o token de quem está logado):
//   { action: "finalize", cardId, path, name } → confere o arquivo já enviado ao Storage e grava os
//     metadados; se não passar, apaga o arquivo e devolve o motivo.
//   { action: "purge" } → apaga do Storage os arquivos da lixeira e os envios que nunca foram aprovados.
//
// A chave service_role só existe aqui dentro (o Supabase a fornece em SUPABASE_SERVICE_ROLE_KEY).
// Dois imports separados: o empacotador do painel não aceita "type" dentro das chaves.
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// ─── Regras (src/lib/attachmentRules.ts) ───

// Regras dos anexos: tamanho, tipos permitidos e conferência do conteúdo real do arquivo (os
// primeiros bytes), não só da extensão. Sem imports de propósito: este arquivo também entra na
// Edge Function (supabase/functions/attachments/handler.ts), que valida no servidor com as mesmas regras.

/** Limite por arquivo. Mudou aqui? Mude também o file_size_limit do bucket (migration). */
export const MAX_ATTACHMENT_MB = 20;
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;

export type AttachmentKind = "image" | "pdf" | "document" | "spreadsheet" | "presentation" | "text" | "archive";

interface AllowedType {
  mime: string;
  kind: AttachmentKind;
  /** Confere a assinatura do conteúdo. */
  matches: (bytes: Uint8Array) => boolean;
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((b, i) => bytes[offset + i] === b);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const includesAscii = (bytes: Uint8Array, text: string) => {
  const needle = ascii(text);
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
};

const isZip = (b: Uint8Array) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);
/** docx/xlsx/pptx são zip com as pastas do Office dentro (os nomes ficam sem compressão no zip). */
const isOffice = (folder: string) => (b: Uint8Array) => isZip(b) && includesAscii(b, "[Content_Types].xml") && includesAscii(b, folder);

/** Texto: sem byte nulo e sem cara de script (#!) ou de executável. */
function isPlainText(b: Uint8Array): boolean {
  const head = b.subarray(0, 8192);
  if (head.includes(0)) return false;
  if (startsWith(head, ascii("#!"))) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head.length === b.length ? head : trimPartialUtf8(head));
    return true;
  } catch {
    // Arquivo antigo em Latin-1 (acentos de um byte) também é texto.
    return !head.some((x) => x < 0x09 || (x > 0x0d && x < 0x20));
  }
}

/** Corta um caractere UTF-8 que ficou pela metade no fim do trecho lido. */
function trimPartialUtf8(b: Uint8Array): Uint8Array {
  let end = b.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const x = b[end - i];
    if ((x & 0xc0) === 0x80) continue; // byte de continuação
    const need = x >= 0xf0 ? 4 : x >= 0xe0 ? 3 : x >= 0xc0 ? 2 : 1;
    if (need > i) end -= i;
    break;
  }
  return b.subarray(0, end);
}

/** Extensão (minúscula, sem ponto) → tipo aceito. O que não está aqui é recusado. */
export const ALLOWED_TYPES: Record<string, AllowedType> = {
  png: { mime: "image/png", kind: "image", matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { mime: "image/jpeg", kind: "image", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: "image/jpeg", kind: "image", matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  webp: { mime: "image/webp", kind: "image", matches: (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8) },
  gif: { mime: "image/gif", kind: "image", matches: (b) => startsWith(b, ascii("GIF87a")) || startsWith(b, ascii("GIF89a")) },
  pdf: { mime: "application/pdf", kind: "pdf", matches: (b) => startsWith(b, ascii("%PDF-")) },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document", matches: isOffice("word/") },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "spreadsheet", matches: isOffice("xl/") },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", kind: "presentation", matches: isOffice("ppt/") },
  txt: { mime: "text/plain", kind: "text", matches: isPlainText },
  csv: { mime: "text/csv", kind: "text", matches: isPlainText },
  zip: { mime: "application/zip", kind: "archive", matches: isZip },
};

/** Tipos aceitos, para o bucket (allowed_mime_types) e para o seletor de arquivos. */
export const ALLOWED_MIME_TYPES = [...new Set(Object.values(ALLOWED_TYPES).map((t) => t.mime))];
export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_TYPES).map((ext) => `.${ext}`).join(",");

export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/** Nome original limpo para guardar como metadado: sem pastas, sem caracteres de controle, até 255. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (clean.length <= 255) return clean;
  const ext = extensionOf(clean);
  return ext ? `${clean.slice(0, 254 - ext.length)}.${ext}` : clean.slice(0, 255);
}

export type AttachmentProblem = "empty" | "tooLarge" | "type" | "content";

export const PROBLEM_TEXT: Record<AttachmentProblem, string> = {
  empty: "O arquivo está vazio.",
  tooLarge: `O arquivo passa de ${MAX_ATTACHMENT_MB} MB.`,
  type: "Esse tipo de arquivo não é aceito. Anexe imagens (png, jpg, webp, gif), pdf, docx, xlsx, pptx, txt, csv ou zip.",
  content: "O conteúdo do arquivo não confere com a extensão dele.",
};

/** O que dá para saber sem ler o arquivo: nome e tamanho (a tela usa antes de enviar). */
export function checkNameAndSize(name: string, size: number): AttachmentProblem | null {
  if (size <= 0) return "empty";
  if (size > MAX_ATTACHMENT_BYTES) return "tooLarge";
  if (!ALLOWED_TYPES[extensionOf(name)]) return "type";
  return null;
}

/**
 * A validação completa, com o conteúdo (a do servidor). Um .exe renomeado para .pdf não tem a
 * assinatura de PDF e é recusado; .js, .sh, .bat, .msi etc. nem estão na lista.
 */
export function checkAttachment(name: string, bytes: Uint8Array): { ok: true; mime: string; kind: AttachmentKind } | { ok: false; problem: AttachmentProblem } {
  const problem = checkNameAndSize(name, bytes.length);
  if (problem) return { ok: false, problem };
  const type = ALLOWED_TYPES[extensionOf(name)];
  if (!type.matches(bytes)) return { ok: false, problem: "content" };
  return { ok: true, mime: type.mime, kind: type.kind };
}

/** Tipo pelo nome (para o ícone e para o Content-Type do envio). */
export const typeOfName = (name: string): AllowedType | null => ALLOWED_TYPES[extensionOf(name)] ?? null;

// ─── Função ───


const BUCKET = "attachments";
const PATH = /^([0-9]{1,18})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Cliente com o token de quem chamou: as perguntas de permissão passam pela RLS dessa pessoa.
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return reply({ error: "Sua sessão expirou. Entre de novo." }, 401);

  let body: { action?: string; cardId?: unknown; path?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Pedido inválido." }, 400);
  }

  try {
    if (body.action === "finalize") return await finalize(admin, asUser, auth.user.id, body);
    if (body.action === "purge") return reply(await purge(admin));
    return reply({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error(e);
    return reply({ error: "Erro no servidor ao tratar o anexo." }, 500);
  }
});

async function finalize(
  admin: SupabaseClient,
  asUser: SupabaseClient,
  userId: string,
  body: { cardId?: unknown; path?: unknown; name?: unknown },
): Promise<Response> {
  const cardId = Number(body.cardId);
  const path = typeof body.path === "string" ? body.path : "";
  const match = PATH.exec(path);
  if (!Number.isSafeInteger(cardId) || !match || Number(match[1]) !== cardId || typeof body.name !== "string") {
    return reply({ error: "Pedido inválido." }, 400);
  }

  const discard = () => admin.storage.from(BUCKET).remove([path]);

  // Mesma regra da policy de envio: só quem edita o card (admin ou membro da equipe).
  const { data: role } = await asUser.rpc("card_role", { p_card_id: cardId });
  if (role !== "admin" && role !== "member") {
    await discard();
    return reply({ error: "Você não pode anexar arquivos neste card." }, 403);
  }

  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(path);
  if (downloadError || !blob) return reply({ error: "O arquivo não chegou ao servidor. Tente de novo." }, 404);
  if (blob.size > MAX_ATTACHMENT_BYTES) {
    await discard();
    return reply({ error: PROBLEM_TEXT.tooLarge, problem: "tooLarge" }, 422);
  }

  const name = cleanFileName(body.name);
  const check = checkAttachment(name, new Uint8Array(await blob.arrayBuffer()));
  if (!check.ok) {
    await discard();
    return reply({ error: PROBLEM_TEXT[check.problem], problem: check.problem }, 422);
  }

  const { data: profile } = await admin.from("profile").select("display_name").eq("id", userId).single();
  const { data: row, error: insertError } = await admin
    .from("card_attachment")
    .insert({
      card_id: cardId,
      name,
      mime_type: check.mime,
      size_bytes: blob.size,
      storage_path: path,
      uploaded_by: userId,
      uploaded_by_name: profile?.display_name ?? "?",
    })
    .select()
    .single();
  if (insertError) {
    // O card pode ter sido excluído no meio do envio.
    await discard();
    return reply({ error: "Não foi possível salvar o anexo. O card ainda existe?" }, 409);
  }
  return reply(row);
}

/** Esvazia a lixeira e apaga envios nunca aprovados com mais de um dia. */
async function purge(admin: SupabaseClient): Promise<{ removed: number }> {
  const { data: trash } = await admin.from("attachment_trash").select("storage_path").limit(1000);
  const { data: orphans } = await admin.rpc("attachment_orphans", { p_older_than: "1 day" });
  const paths = [...(trash ?? []), ...((orphans as { storage_path: string }[] | null) ?? [])].map((r) => r.storage_path);

  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    // Caminho que já não existe no Storage não dá erro: some da lixeira do mesmo jeito.
    const { error } = await admin.storage.from(BUCKET).remove(batch);
    if (error) throw error;
    await admin.from("attachment_trash").delete().in("storage_path", batch);
    removed += batch.length;
  }
  return { removed };
}
