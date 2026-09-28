import { useState } from "react";
import { labelStep, niceMax, ticks } from "../../../lib/chartScale";
import { BG, FILL, STROKE, type ChartColor } from "./colors";
import { useElementWidth } from "./useElementWidth";

export interface LineSeries {
  name: string;
  values: (number | null)[];
  color: ChartColor;
  dashed?: boolean;
}

// r cabe o rótulo mais longo no fim de linha ("Média da equipe", ~93px) sem cortar no card.
const PAD = { l: 40, r: 112, t: 12, b: 24 };

/** Linhas ao longo das semanas, com linha guia e dica no hover e rótulo no fim de cada série. */
export function LineChart({
  labels,
  series,
  format,
  ariaLabel,
  height = 200,
}: {
  labels: string[];
  series: LineSeries[];
  format: (v: number) => string;
  ariaLabel: string;
  height?: number;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = Math.max(0, width - PAD.l - PAD.r);
  const h = height - PAD.t - PAD.b;
  const values = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const max = niceMax(Math.max(0, ...values));
  const x = (i: number) => PAD.l + (labels.length <= 1 ? w / 2 : (i * w) / (labels.length - 1));
  const y = (v: number) => PAD.t + h - (v / max) * h;
  const step = labelStep(labels.length, w);

  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  // Rótulo no fim de cada linha, afastando os que ficariam a menos de 12px um do outro.
  const ends = series
    .map((s) => {
      const i = s.values.findLastIndex((v) => v != null);
      return i < 0 ? null : { name: s.name, y: y(s.values[i]!) };
    })
    .filter((e): e is { name: string; y: number } => e != null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left;
    if (labels.length === 0 || w === 0) return;
    const i = Math.round(((mx - PAD.l) / w) * (labels.length - 1));
    setHover(Math.min(labels.length - 1, Math.max(0, i)));
  }

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
          {ticks(max).map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={PAD.l + w} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-text-muted text-[10px]">
                {format(t)}
              </text>
            </g>
          ))}
          {labels.map((label, i) =>
            i % step === 0 ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-text-muted text-[10px]">
                {label}
              </text>
            ) : null,
          )}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + h} className="stroke-text-muted" strokeWidth={1} />}
          {series.map((s) => (
            <path
              key={s.name}
              d={path(s.values)}
              fill="none"
              className={STROKE[s.color]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "4 4" : undefined}
            />
          ))}
          {hover != null &&
            series.map((s) =>
              s.values[hover] != null ? (
                <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r={4} className={`${FILL[s.color]} stroke-bg-surface`} strokeWidth={2} />
              ) : null,
            )}
          {ends.map((e) => (
            <text key={e.name} x={PAD.l + w + 6} y={e.y} dominantBaseline="middle" className="fill-text-primary text-[11px]">
              {e.name}
            </text>
          ))}
        </svg>
      )}
      {hover != null && width > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-border bg-bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(0, x(hover) + 10), width - 150) }}
        >
          <p className="mb-1 font-semibold text-text-primary">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center gap-2 text-text-muted">
              <span className={`h-2 w-2 rounded-full ${BG[s.color]}`} />
              {s.name}
              <span className="ml-auto pl-3 tabular-nums text-text-primary">{s.values[hover] == null ? "—" : format(s.values[hover]!)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
