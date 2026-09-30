import type { MetricId } from "../../lib/dashboardRules";
import type { Tone } from "../../lib/metrics";
import { variation } from "../../lib/variation";

const TONE_CLASS: Record<Tone, string> = {
  good: "text-success",
  bad: "text-danger",
  neutral: "text-text-muted",
};

/**
 * A variação de uma métrica, igual em todo o dashboard: "▲ +9 tarefas no período", com a cor do que
 * é bom ou ruim e a leitura em frase no tooltip. Nenhum outro lugar formata variação.
 * Só span aqui dentro: pode ficar dentro de um <button> (o StatTile).
 */
export function Variation({ metric, current, previous }: { metric: MetricId; current: number | null; previous: number | null }) {
  const v = variation(metric, current, previous);
  if (!v) return <span className="text-xs text-text-muted">—</span>;
  return (
    <span className={`group/var relative self-start text-xs ${TONE_CLASS[v.tone]}`}>
      {v.text}
      {/* Fica na árvore de acessibilidade (opacidade, não display): o leitor de tela lê a frase. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 w-64 rounded-lg border border-border bg-bg-surface px-3 py-2 text-xs normal-case text-text-primary opacity-0 shadow-lg transition-opacity group-hover/var:opacity-100"
      >
        {v.tooltip}
      </span>
    </span>
  );
}
