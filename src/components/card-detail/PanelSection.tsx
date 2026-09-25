import type { ReactNode } from "react";

/** Bloco do painel do card: título curto em caixa alta com filete, e conteúdo abaixo. */
export function PanelSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <div className="flex items-center gap-2">
        <span className="h-0.5 w-4 bg-danger" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
        {aside && <span className="ml-auto text-xs tabular-nums text-text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
