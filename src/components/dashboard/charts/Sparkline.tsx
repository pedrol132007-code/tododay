import { useId } from "react";

/**
 * Minigráfico de linha sem eixos, para tendência ao lado de um número. Embaixo da linha, uma área
 * em `chart-1` que some em direção à base; o ponto marca o último valor.
 */
export function Sparkline({ values: raw, width = 132, height = 44 }: { values: (number | null)[]; width?: number; height?: number }) {
  const gradientId = useId();
  // Blocos sem valor (sem entregas não há tempo nem taxa) saem da linha: fica só a tendência.
  const values = raw.filter((v): v is number => v != null);
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  // Folga à direita e em cima para o ponto final (raio 3 + anel 2) não ser cortado.
  const pad = 5;
  const x = (i: number) => (i * (width - pad)) / (values.length - 1);
  const y = (v: number) => height - 1 - (v / max) * (height - 1 - pad);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = values.length - 1;
  const area = `${line}L${x(last).toFixed(1)},${height}L0,${height}Z`;
  return (
    <svg width={width} height={height} aria-hidden="true" className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1={height} x2="0" y2={0}>
          <stop offset="0" style={{ stopColor: "rgb(var(--chart-1))", stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--chart-1))", stopOpacity: 0.4 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" className="stroke-chart-1" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={3} className="fill-chart-1 stroke-bg-surface" strokeWidth={2} />
    </svg>
  );
}
