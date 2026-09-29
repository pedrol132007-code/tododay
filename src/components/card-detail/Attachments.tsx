import { useRef, useState } from "react";
import type { CardAttachment } from "../../types";
import { downloadUrl } from "../../db/attachments";
import { useAttachmentUrls, useDeleteAttachment, useSetCardCover, type AttachmentUpload } from "../../hooks/useAttachments";
import { useCanEdit } from "../../hooks/useCurrentTeam";
import { ACCEPT_ATTRIBUTE, MAX_ATTACHMENT_MB } from "../../lib/attachmentRules";
import { localDay } from "../../lib/dashboardRules";
import { IconImage, IconPaperclip, IconTrash, IconX } from "../ui/icons";
import { AttachmentList } from "./AttachmentList";
import { PanelSection } from "./PanelSection";

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

  const list = attachments ?? [];

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
        <AttachmentList
          items={list.map((a) => {
            const url = urls?.get(a.storage_path);
            return {
              key: a.id,
              name: a.name,
              isImage: a.mime_type.startsWith("image/"),
              sizeBytes: a.size_bytes,
              uploaderName: a.uploaded_by_name,
              day: localDay(new Date(a.created_at)),
              isCover: a.is_cover,
              url,
              downloadHref: url && downloadUrl(url, a.name),
            };
          })}
          actions={(item) => {
            if (!canEdit) return null;
            const id = item.key as number;
            return (
              <>
                {item.isImage && (
                  <button
                    type="button"
                    onClick={() => setCover.mutate(item.isCover ? null : id)}
                    aria-pressed={item.isCover}
                    aria-label={item.isCover ? `Tirar ${item.name} da capa` : `Usar ${item.name} como capa`}
                    title={item.isCover ? "Tirar da capa" : "Usar como capa"}
                    className={`rounded-lg p-1.5 hover:bg-bg-surface ${item.isCover ? "text-primary" : "text-text-muted hover:text-text-primary"}`}
                  >
                    <IconImage size={15} />
                  </button>
                )}
                {confirmingId === id ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        deleteAttachment.mutate(id);
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
                    onClick={() => setConfirmingId(id)}
                    aria-label={`Excluir ${item.name}`}
                    title="Excluir anexo"
                    className="rounded-lg p-1.5 text-text-muted hover:bg-danger hover:text-on-accent"
                  >
                    <IconTrash size={15} />
                  </button>
                )}
              </>
            );
          }}
        />
      )}
    </PanelSection>
  );
}
