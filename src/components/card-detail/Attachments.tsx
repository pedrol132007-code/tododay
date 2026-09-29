import { useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { CardAttachment } from "../../types";
import { downloadUrl } from "../../db/attachments";
import { useAttachmentUrls, useDeleteAttachment, useSetCardCover, type AttachmentUpload } from "../../hooks/useAttachments";
import { useCanEdit } from "../../hooks/useCurrentTeam";
import { ACCEPT_ATTRIBUTE, MAX_ATTACHMENT_MB, typeOfName, type AttachmentKind } from "../../lib/attachmentRules";
import { formatBytes, formatDue } from "../../lib/boardVisuals";
import { localDay } from "../../lib/dashboardRules";
import { Lightbox } from "../ui/Lightbox";
import { IconDownload, IconFile, IconImage, IconPaperclip, IconTrash, IconX } from "../ui/icons";
import { PanelSection } from "./PanelSection";

const KIND_LABEL: Record<Exclude<AttachmentKind, "image">, string> = {
  pdf: "PDF",
  document: "DOC",
  spreadsheet: "XLS",
  presentation: "PPT",
  text: "TXT",
  archive: "ZIP",
};

const isImage = (a: CardAttachment) => a.mime_type.startsWith("image/");

/** Miniatura da imagem, ou o ícone de arquivo com a sigla do tipo. */
function Thumb({ attachment, url }: { attachment: CardAttachment; url?: string }) {
  const box = "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-bg-elevated";
  if (isImage(attachment)) {
    return <span className={box}>{url && <img src={url} alt="" className="h-full w-full object-cover" />}</span>;
  }
  const kind = typeOfName(attachment.name)?.kind;
  return (
    <span className={`${box} flex-col gap-0 text-text-muted`}>
      <IconFile size={16} />
      <span className="text-[9px] font-semibold leading-none">{kind && kind !== "image" ? KIND_LABEL[kind] : ""}</span>
    </span>
  );
}

/**
 * Anexos do card aberto: enviar (botão, arrastar para o painel ou colar imagem), acompanhar o
 * envio, ver e excluir. Imagem abre ampliada; PDF em outra aba; o resto é baixado.
 */
export function Attachments({ cardId, attachments, uploads, onFiles, dragging }: {
  cardId: number;
  attachments: CardAttachment[] | undefined;
  uploads: AttachmentUpload[];
  onFiles: (files: File[]) => void;
  /** Há arquivos sendo arrastados sobre o painel. */
  dragging: boolean;
}) {
  const canEdit = useCanEdit();
  const { data: urls } = useAttachmentUrls(attachments);
  const deleteAttachment = useDeleteAttachment(cardId);
  const setCover = useSetCardCover(cardId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  const list = attachments ?? [];
  const images = list.filter(isImage);
  const today = new Date();

  return (
    <PanelSection title="Anexos" aside={list.length > 0 ? String(list.length) : undefined}>
      {canEdit && (
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed p-3 text-xs transition-colors ${
            dragging ? "border-primary bg-primary/10 text-text-primary" : "border-border text-text-muted"
          }`}
        >
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-2.5 py-1 text-sm text-text-primary hover:border-primary"
          >
            <IconPaperclip size={14} /> Anexar arquivo
          </button>
          <span>{dragging ? "Solte para anexar" : `ou arraste para cá, ou cole uma imagem (Ctrl+V). Até ${MAX_ATTACHMENT_MB} MB.`}</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={(e) => {
              onFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="flex flex-col gap-2">
          {uploads.map((u) => (
            <li key={u.id} className="flex flex-col gap-1.5 rounded-xl border border-border bg-bg-card px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-text-primary">{u.name}</span>
                {!u.error && <span className="text-xs tabular-nums text-text-muted">{Math.round(u.progress * 100)}%</span>}
                <button
                  type="button"
                  onClick={u.cancel}
                  aria-label={u.error ? `Dispensar aviso de ${u.name}` : `Cancelar envio de ${u.name}`}
                  title={u.error ? "Dispensar" : "Cancelar envio"}
                  className="rounded-lg p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
                >
                  <IconX size={14} />
                </button>
              </div>
              {u.error ? (
                <p role="alert" className="text-xs text-danger">
                  {u.error}
                </p>
              ) : (
                <div className="h-1.5 overflow-hidden rounded-full bg-bg-elevated" role="progressbar" aria-label={`Enviando ${u.name}`} aria-valuenow={Math.round(u.progress * 100)}>
                  <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${u.progress * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {list.length === 0 && uploads.length === 0 && !canEdit && <p className="text-sm text-text-muted">Nenhum anexo.</p>}

      {list.length > 0 && (
        <ul className="flex flex-col gap-1">
          {list.map((a) => {
            const url = urls?.get(a.storage_path);
            const kind = typeOfName(a.name)?.kind;
            const meta = `${formatBytes(a.size_bytes)} · ${a.uploaded_by_name} · ${formatDue(localDay(new Date(a.created_at)), today)}`;
            const nameClass = "min-w-0 truncate text-left text-sm text-text-primary hover:text-primary";
            return (
              <li key={a.id} className="group flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-bg-elevated">
                <Thumb attachment={a} url={url} />
                <div className="flex min-w-0 flex-1 flex-col">
                  {/* Imagem amplia aqui; PDF abre em outra aba; o resto baixa com o nome original. */}
                  {isImage(a) ? (
                    <button type="button" disabled={!url} onClick={() => setViewing(images.indexOf(a))} className={nameClass} title={a.name}>
                      {a.name}
                    </button>
                  ) : (
                    <a
                      href={url && (kind === "pdf" ? url : downloadUrl(url, a.name))}
                      target={kind === "pdf" ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className={nameClass}
                      title={a.name}
                    >
                      {a.name}
                    </a>
                  )}
                  <span className="truncate text-xs text-text-muted">
                    {a.is_cover && <span className="mr-1.5 rounded bg-highlight px-1 font-semibold text-black">Capa</span>}
                    {meta}
                  </span>
                </div>
                {canEdit && isImage(a) && (
                  <button
                    type="button"
                    onClick={() => setCover.mutate(a.is_cover ? null : a.id)}
                    aria-pressed={a.is_cover}
                    aria-label={a.is_cover ? `Tirar ${a.name} da capa` : `Usar ${a.name} como capa`}
                    title={a.is_cover ? "Tirar da capa" : "Usar como capa"}
                    className={`rounded-lg p-1.5 hover:bg-bg-surface ${a.is_cover ? "text-primary" : "text-text-muted hover:text-text-primary"}`}
                  >
                    <IconImage size={15} />
                  </button>
                )}
                {url && (
                  <a href={downloadUrl(url, a.name)} aria-label={`Baixar ${a.name}`} title="Baixar" className="rounded-lg p-1.5 text-text-muted hover:bg-bg-surface hover:text-text-primary">
                    <IconDownload size={15} />
                  </a>
                )}
                {canEdit &&
                  (confirmingId === a.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          deleteAttachment.mutate(a.id);
                          setConfirmingId(null);
                        }}
                        className="rounded-lg bg-danger px-2 py-1 text-xs font-semibold text-on-accent"
                      >
                        Excluir
                      </button>
                      <button type="button" onClick={() => setConfirmingId(null)} className="rounded-lg px-2 py-1 text-xs text-text-muted hover:text-text-primary">
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(a.id)}
                      aria-label={`Excluir ${a.name}`}
                      title="Excluir anexo"
                      className="rounded-lg p-1.5 text-text-muted hover:bg-danger hover:text-on-accent"
                    >
                      <IconTrash size={15} />
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      <AnimatePresence>
        {viewing != null && urls && (
          <Lightbox
            images={images.map((a) => ({ url: urls.get(a.storage_path) ?? "", name: a.name, downloadUrl: downloadUrl(urls.get(a.storage_path) ?? "", a.name) }))}
            index={viewing}
            onIndex={setViewing}
            onClose={() => setViewing(null)}
          />
        )}
      </AnimatePresence>
    </PanelSection>
  );
}
