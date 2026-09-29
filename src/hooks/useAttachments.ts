import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AttachmentError,
  deleteAttachment,
  listAttachments,
  listAttachmentsOfList,
  listBoardAttachments,
  setCardCover,
  SIGNED_URL_SECONDS,
  signAttachmentUrls,
  uploadAttachment,
  type AttachmentSummary,
} from "../db/attachments";
import type { CardAttachment } from "../types";

export function useAttachments(cardId: number) {
  return useQuery({ queryKey: ["attachments", cardId], queryFn: () => listAttachments(cardId) });
}

/** URLs assinadas dos anexos, renovadas antes de vencer. */
export function useAttachmentUrls(attachments: Pick<CardAttachment, "storage_path">[] | undefined) {
  const paths = (attachments ?? []).map((a) => a.storage_path);
  return useQuery({
    queryKey: ["attachmentUrls", paths],
    queryFn: () => signAttachmentUrls(paths),
    enabled: paths.length > 0,
    staleTime: (SIGNED_URL_SECONDS - 60) * 1000,
    refetchInterval: (SIGNED_URL_SECONDS - 60) * 1000,
  });
}

/** Depois de enviar: a lista do card e as contagens do board. */
export function useInvalidateAttachments(cardId: number) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["attachments", cardId] });
    void queryClient.invalidateQueries({ queryKey: ["boardAttachments"] });
  };
}

export function useDeleteAttachment(cardId: number) {
  const invalidate = useInvalidateAttachments(cardId);
  return useMutation({ mutationFn: (id: number) => deleteAttachment(id), onSuccess: invalidate, onError: invalidate });
}

export interface AttachmentUpload {
  id: number;
  name: string;
  /** 0 a 1. */
  progress: number;
  /** Mensagem pronta quando o envio falhou (fica na tela até dispensar). */
  error?: string;
  cancel: () => void;
}

/** "image.png" colado da área de transferência vira "imagem-colada-2026-09-29-1432.png". */
function pastedName(file: File): File {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const name = `imagem-colada-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}.${ext}`;
  return new File([file], name, { type: file.type });
}

/**
 * Envios em andamento de um card, com progresso e cancelar. `enabled` liga também o Ctrl+V: uma
 * imagem colada em qualquer lugar do painel vira anexo.
 */
export function useAttachmentUploads(cardId: number, enabled: boolean) {
  const [uploads, setUploads] = useState<AttachmentUpload[]>([]);
  const nextId = useRef(1);
  const invalidate = useInvalidateAttachments(cardId);

  const patch = (id: number, changes: Partial<AttachmentUpload>) => setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...changes } : u)));
  const drop = (id: number) => setUploads((list) => list.filter((u) => u.id !== id));

  function send(files: File[]) {
    for (const file of files) {
      const id = nextId.current++;
      const controller = new AbortController();
      setUploads((list) => [...list, { id, name: file.name, progress: 0, cancel: () => controller.abort() }]);
      uploadAttachment(cardId, file, { onProgress: (progress) => patch(id, { progress }), signal: controller.signal })
        .then(() => {
          drop(id);
          invalidate();
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === "AbortError") return drop(id);
          patch(id, { error: e instanceof AttachmentError ? e.message : "O envio falhou. Tente de novo.", cancel: () => drop(id) });
        });
    }
  }

  useEffect(() => {
    if (!enabled) return;
    function onPaste(e: ClipboardEvent) {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      send(files.map((f) => (f.type.startsWith("image/") && /^image\.\w+$/.test(f.name) ? pastedName(f) : f)));
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  return { uploads, send };
}

export interface CardAttachmentTotals {
  count: number;
  bytes: number;
  /** Caminho da imagem de capa, se houver. */
  coverPath: string | null;
}

/** Totais por card de um conjunto de anexos. */
export function totalsByCard(rows: AttachmentSummary[]): Map<number, CardAttachmentTotals> {
  const map = new Map<number, CardAttachmentTotals>();
  for (const r of rows) {
    const t = map.get(r.card_id) ?? { count: 0, bytes: 0, coverPath: null };
    t.count++;
    t.bytes += r.size_bytes;
    if (r.is_cover) t.coverPath = r.storage_path;
    map.set(r.card_id, t);
  }
  return map;
}

/** Anexos do board inteiro, somados por card (📎 no card fechado, capa e avisos de exclusão). */
export function useBoardAttachments(boardId: number) {
  return useQuery({
    queryKey: ["boardAttachments", boardId],
    queryFn: () => listBoardAttachments(boardId),
    select: totalsByCard,
  });
}

/** Quantos anexos (e quanto espaço) somem ao excluir a coluna. Só busca quando `enabled`. */
export function useListAttachmentTotals(listId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["boardAttachments", "list", listId],
    queryFn: () => listAttachmentsOfList(listId),
    select: (rows) => ({ count: rows.length, bytes: rows.reduce((n, r) => n + r.size_bytes, 0) }),
    enabled,
  });
}

export function useSetCardCover(cardId: number) {
  const invalidate = useInvalidateAttachments(cardId);
  return useMutation({ mutationFn: (attachmentId: number | null) => setCardCover(cardId, attachmentId), onSuccess: invalidate, onError: invalidate });
}
