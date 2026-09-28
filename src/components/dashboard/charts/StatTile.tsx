import { Sparkline } from "./Sparkline";

/** Número principal do dashboard: valor, variação escrita (nunca só cor) e minigráfico. */
export function StatTile({
  label,
  value,
  unit,
  delta,
  spark,
}: {
  label: string;
  value: string;
  /** Unidade discreta ao lado do número (ex.: "dias"). */
  unit?: string;
  delta?: string | null;
  spark?: number[];
}) {
  return (
    <div className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-bg-surface p-5">
      {/* Faixa com o degradê azul→vermelho da marca: só decoração, não codifica dado. */}
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-chart-1 to-chart-2" aria-hidden="true" />
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="text-4xl font-normal leading-none tracking-[-0.03em] text-text-primary tabular-nums">
          {value}
          {unit && <span className="ml-1.5 text-base tracking-normal text-text-muted">{unit}</span>}
        </span>
        {spark && <Sparkline values={spark} />}
      </div>
      <span className="text-xs text-text-muted">{delta ?? "—"}</span>
    </div>
  );
}
