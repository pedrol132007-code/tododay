/** Número principal do dashboard: valor, variação escrita (nunca só cor) e minigráfico. */
export function StatTile({ label, value, delta, spark }: { label: string; value: string; delta?: string | null; spark?: number[] }) {
  const max = Math.max(1, ...(spark ?? []));
  const points = (spark ?? []).map((v, i, all) => `${all.length <= 1 ? 48 : (i * 96) / (all.length - 1)},${26 - (v / max) * 24}`).join(" ");
  return (
    <div className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-bg-surface p-5">
      {/* Faixa com o degradê azul→vermelho da marca: só decoração, não codifica dado. */}
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-chart-1 to-chart-2" aria-hidden="true" />
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="text-4xl font-normal leading-none tracking-[-0.03em] text-text-primary tabular-nums">{value}</span>
        {spark && spark.length > 1 && (
          <svg width="96" height="28" aria-hidden="true" className="shrink-0">
            <polyline points={points} fill="none" className="stroke-chart-1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <span className="text-xs text-text-muted">{delta ?? "—"}</span>
    </div>
  );
}
