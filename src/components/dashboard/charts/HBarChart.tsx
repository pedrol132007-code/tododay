import { niceMax } from "../../../lib/chartScale";
import { BG } from "./colors";

/** Barras horizontais empilhadas (a + b) por pessoa, com 2px entre os segmentos. */
export function HBarChart({ rows, aLabel, bLabel }: { rows: { id: string; name: string; a: number; b: number }[]; aLabel: string; bLabel: string }) {
  const max = niceMax(Math.max(0, ...rows.map((r) => r.a + r.b)));
  return (
    <ul className="flex flex-col gap-2.5" aria-label={`${aLabel} e ${bLabel} por pessoa`}>
      {rows.map((r) => (
        <li key={r.id} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-3 text-sm" title={`${r.name}: ${r.a} ${aLabel.toLowerCase()}, ${r.b} ${bLabel.toLowerCase()}`}>
          <span className="truncate text-text-primary">{r.name}</span>
          <span className="flex h-3 gap-[2px]">
            {r.a > 0 && <span className={`h-full rounded-l ${r.b === 0 ? "rounded-r" : ""} ${BG["chart-1"]}`} style={{ width: `${(r.a / max) * 100}%` }} />}
            {r.b > 0 && <span className={`h-full rounded-r ${r.a === 0 ? "rounded-l" : ""} ${BG["chart-2"]}`} style={{ width: `${(r.b / max) * 100}%` }} />}
          </span>
          <span className="text-right text-xs tabular-nums text-text-muted">
            {r.a} · {r.b}
          </span>
        </li>
      ))}
    </ul>
  );
}
