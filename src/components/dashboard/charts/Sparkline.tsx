/** Minigráfico de linha sem eixos, para tendência ao lado de um número. */
export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => `${(i * width) / (values.length - 1)},${height - 2 - (v / max) * (height - 4)}`).join(" ");
  return (
    <svg width={width} height={height} aria-hidden="true" className="shrink-0">
      <polyline points={points} fill="none" className="stroke-chart-1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
