import { useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { typeOfName, type AttachmentKind } from "../../lib/attachmentRules";
import { formatBytes, formatDue } from "../../lib/boardVisuals";
import { Lightbox } from "../ui/Lightbox";
import { IconDownload, IconFile } from "../ui/icons";

const KIND_LABEL: Record<Exclude<AttachmentKind, "image">, string> = {
  pdf: "PDF",
  document: "DOC",
  spreadsheet: "XLS",
  presentation: "PPT",
  text: "TXT",
  archive: "ZIP",
};

/** Um anexo pronto para mostrar: do card real (URL assinada) ou da demonstração (URL blob:). */
export interface AttachmentItem {
  key: string | number;
  name: string;
  isImage: boolean;
  sizeBytes: number;
  uploaderName: string;
  /** "AAAA-MM-DD". */
  day: string;
  isCover: boolean;
  /** Ver (miniatura, ampliar, abrir o PDF). Sem ela a linha espera. */
  url?: string;
  /** Baixar com o nome original. */
  downloadHref?: string;
}

/** Miniatura da imagem, ou o ícone de arquivo com a sigla do tipo. */
function Thumb({ item }: { item: AttachmentItem }) {
  const box = "flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-bg-elevated";
  if (item.isImage) return <span className={box}>{item.url && <img src={item.url} alt="" className="h-full w-full object-cover" />}</span>;
  const kind = typeOfName(item.name)?.kind;
  return (
    <span className={`${box} flex-col gap-0 text-text-muted`}>
      <IconFile size={16} />
      <span className="text-[9px] font-semibold leading-none">{kind && kind !== "image" ? KIND_LABEL[kind] : ""}</span>
    </span>
  );
}

/**
 * A lista de anexos: miniatura ou ícone, nome, tamanho, quem enviou e quando. Imagem amplia (com
 * navegação entre as imagens), PDF abre em outra aba e o resto baixa. `actions` põe botões extras
 * em cada linha (capa, excluir).
 */
export function AttachmentList({ items, actions }: { items: AttachmentItem[]; actions?: (item: AttachmentItem) => ReactNode }) {
  const [viewing, setViewing] = useState<number | null>(null);
  const images = items.filter((i) => i.isImage && i.url);
  const today = new Date();
  const nameClass = "min-w-0 truncate text-left text-sm text-text-primary hover:text-primary";

  return (
    <>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const pdf = typeOfName(item.name)?.kind === "pdf";
          return (
            <li key={item.key} className="group flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-bg-elevated">
              <Thumb item={item} />
              <div className="flex min-w-0 flex-1 flex-col">
                {item.isImage ? (
                  <button type="button" disabled={!item.url} onClick={() => setViewing(images.indexOf(item))} className={nameClass} title={item.name}>
                    {item.name}
                  </button>
                ) : (
                  <a
                    href={pdf ? item.url : item.downloadHref}
                    target={pdf ? "_blank" : undefined}
                    download={pdf ? undefined : item.name}
                    rel="noopener noreferrer"
                    className={nameClass}
                    title={item.name}
                  >
                    {item.name}
                  </a>
                )}
                <span className="truncate text-xs text-text-muted">
                  {item.isCover && <span className="mr-1.5 rounded bg-highlight px-1 font-semibold text-black">Capa</span>}
                  {formatBytes(item.sizeBytes)} · {item.uploaderName} · {formatDue(item.day, today)}
                </span>
              </div>
              {item.downloadHref && (
                <a
                  href={item.downloadHref}
                  download={item.name}
                  aria-label={`Baixar ${item.name}`}
                  title="Baixar"
                  className="rounded-lg p-1.5 text-text-muted hover:bg-bg-surface hover:text-text-primary"
                >
                  <IconDownload size={15} />
                </a>
              )}
              {actions?.(item)}
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {viewing != null && images[viewing] && (
          <Lightbox
            images={images.map((i) => ({ url: i.url!, name: i.name, downloadUrl: i.downloadHref ?? i.url! }))}
            index={viewing}
            onIndex={setViewing}
            onClose={() => setViewing(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
