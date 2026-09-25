import type { ReactNode } from "react";
import { IconArrowLeft } from "./icons";

/**
 * Título de página no estilo do site da Benner: filete vermelho curto, título grande em peso
 * regular com letras mais juntas e, opcionalmente, um rótulo em caixa alta acima.
 */
export function PageHeader({ title, eyebrow, onBack }: { title: ReactNode; eyebrow?: string; onBack?: () => void }) {
  return (
    <div className="mb-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="-ml-3 mb-3 inline-flex items-center gap-1 rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
        >
          <IconArrowLeft size={14} />
          Voltar
        </button>
      )}
      <div className="mb-3 h-0.5 w-12 bg-danger" />
      {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{eyebrow}</p>}
      <h1 className="text-3xl font-normal leading-tight tracking-[-0.03em] text-text-primary">{title}</h1>
    </div>
  );
}
