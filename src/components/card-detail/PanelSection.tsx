import type { ReactNode } from "react";

/** Bloco do painel do card: título curto em cinza e conteúdo abaixo. Quem separa os blocos é o espaço. */
export function PanelSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 pt-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
        {aside && <span className="text-xs tabular-nums text-text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
