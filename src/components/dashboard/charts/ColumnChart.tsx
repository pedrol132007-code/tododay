import { useState } from "react";
import { axis, labelStep } from "../../../lib/chartScale";
import { BG, STROKE } from "./colors";
import { tipPosition } from "./tipPosition";
import { useElementWidth } from "./useElementWidth";

const PAD = { l: 40, r: 12, t: 12, b: 24 };

/** Colunas com topo arredondado; `reference` desenha a média da equipe tracejada por cima. */
function barPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function ColumnChart({
  labels,
  values,
  name,
  format,
  ariaLabel,
  reference,
  referenceName,
  height = 200,
}: {
  labels: string[];
  values: number[];
  name: string;
  format: (v: number) => string;
  ariaLabel: string;
  reference?: (number | null)[];
  referenceName?: string;
  height?: number;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = Math.max(0, width - PAD.l - PAD.r);
  const h = height - PAD.t - PAD.b;
  const all = [...values, ...(reference ?? []).filter((v): v is number => v != null)];
  // Tudo no dashboard (contagens, dias, %) lê melhor com marcações inteiras.
  const { max, ticks } = axis(Math.max(0, ...all), { integer: true });
  const band = labels.length ? w / labels.length : 0;
  const barW = Math.max(2, Math.min(28, band - 2));
  const cx = (i: number) => PAD.l + band * i + band / 2;
  const y = (v: number) => PAD.t + h - (v / max) * h;
  const step = labelStep(labels.length, w);
  const refPath = reference
    ?.map((v, i) => (v == null ? "" : `${i === 0 || reference[i - 1] == null ? "M" : "L"}${cx(i).toFixed(1)},${y(v).toFixed(1)}`))
    .join("");

  return (
    <div ref={ref} className="relative" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={PAD.l + w} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-text-muted text-[10px]">
                {format(t)}
              </text>
            </g>
          ))}
          {values.map((v, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.l + band * i} y={PAD.t} width={band} height={h} fill="transparent" />
              <path
                d={barPath(cx(i) - barW / 2, y(v), barW, PAD.t + h - y(v), 4)}
                className={`fill-chart-1 transition-opacity ${hover != null && hover !== i ? "opacity-50" : ""}`}
              />
            </g>
          ))}
          {refPath && <path d={refPath} fill="none" className={STROKE["chart-ref"]} strokeWidth={2} strokeDasharray="4 4" pointerEvents="none" />}
          {labels.map((label, i) =>
            i % step === 0 ? (
              <text key={i} x={cx(i)} y={height - 6} textAnchor="middle" className="fill-text-muted text-[10px]">
                {label}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {hover != null && width > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-32 rounded-lg border border-border bg-bg-surface px-3 py-2 text-xs shadow-lg"
          style={tipPosition(cx(hover), PAD.l + w / 2, width)}
        >
          <p className="mb-1 font-semibold text-text-primary">{labels[hover]}</p>
          <p className="flex items-center gap-2 text-text-muted">
            <span className={`h-2 w-2 rounded-full ${BG["chart-1"]}`} />
            {name}
            <span className="ml-auto pl-3 tabular-nums text-text-primary">{format(values[hover])}</span>
          </p>
          {reference && referenceName && (
            <p className="flex items-center gap-2 text-text-muted">
              <span className={`h-2 w-2 rounded-full ${BG["chart-ref"]}`} />
              {referenceName}
              <span className="ml-auto pl-3 tabular-nums text-text-primary">{reference[hover] == null ? "—" : format(reference[hover]!)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
