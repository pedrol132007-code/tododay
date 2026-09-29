import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { IconChevronLeft, IconChevronRight, IconDownload, IconX } from "./icons";

export interface LightboxImage {
  url: string;
  name: string;
  /** Link que baixa com o nome original. */
  downloadUrl: string;
}

/**
 * Imagem ampliada por cima de tudo, com as setas (na tela e no teclado) para passar entre as
 * imagens. Esc fecha só a visualização, não o painel por baixo. Vai direto no body: o painel
 * que a abre se move (animação), e um pai com transform prenderia o `fixed` dentro dele.
 */
export function Lightbox({ images, index, onIndex, onClose }: { images: LightboxImage[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const image = images[index];
  const many = images.length > 1;
  const go = (step: number) => onIndex((index + step + images.length) % images.length);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && many) go(-1);
      else if (e.key === "ArrowRight" && many) go(1);
      else return;
      // Na captura, antes do painel do card (que também fecha com Esc).
      e.stopPropagation();
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!image) return null;
  const nav = "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-on-accent hover:bg-highlight hover:text-black";

  return createPortal(
    <motion.div
      role="dialog"
      aria-label={`Imagem ${image.name}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[70] flex flex-col bg-black/85"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center gap-3 px-4 py-3 text-sm text-on-accent" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate">{image.name}</span>
        {many && (
          <span className="tabular-nums text-on-accent/70">
            {index + 1} de {images.length}
          </span>
        )}
        <a href={image.downloadUrl} className="rounded-lg p-1.5 hover:bg-on-accent/15" aria-label="Baixar imagem" title="Baixar">
          <IconDownload size={18} />
        </a>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-on-accent/15" aria-label="Fechar visualização">
          <IconX size={18} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-8">
        <img src={image.url} alt={image.name} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
        {many && (
          <>
            <button type="button" onClick={(e) => (e.stopPropagation(), go(-1))} className={`${nav} left-4`} aria-label="Imagem anterior">
              <IconChevronLeft size={22} />
            </button>
            <button type="button" onClick={(e) => (e.stopPropagation(), go(1))} className={`${nav} right-4`} aria-label="Próxima imagem">
              <IconChevronRight size={22} />
            </button>
          </>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
