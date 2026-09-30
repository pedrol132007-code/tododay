import { IconChevronLeft } from "../ui/icons";
import { ListCounter } from "./ListCounter";

/**
 * Coluna recolhida: faixa estreita com a contagem (em alerta acima do WIP) e o nome na vertical.
 * Clicar em qualquer ponto abre de novo. Não arrasta nem recebe cards: para isso, abre-se antes.
 */
export function CollapsedColumn({ name, count, wipLimit, onExpand }: { name: string; count: number; wipLimit: number | null; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`Abrir coluna ${name} (${count} ${count === 1 ? "card" : "cards"})`}
      title="Abrir coluna"
      className="flex w-12 shrink-0 flex-col items-center gap-3 rounded-2xl border border-border bg-bg-column py-3 text-text-primary transition-colors hover:border-primary"
    >
      <ListCounter count={count} wipLimit={wipLimit} />
      <span className="max-h-80 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold [writing-mode:vertical-rl]">{name}</span>
    </button>
  );
}

/** O "‹" do cabeçalho. Fica dentro da alça de arrastar, então não deixa o clique começar um arrasto. */
export function CollapseButton({ name, onCollapse }: { name: string; onCollapse: () => void }) {
  return (
    <button
      type="button"
      onClick={onCollapse}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      aria-label={`Recolher coluna ${name}`}
      title="Recolher coluna"
      className="rounded-lg p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
    >
      <IconChevronLeft size={14} />
    </button>
  );
}
