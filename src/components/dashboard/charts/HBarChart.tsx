import { axis } from "../../../lib/chartScale";

/**
 * Uma barra por pessoa (`value`) com o degradê azul→vermelho da marca revelado até o tamanho da barra,
 * e ao lado um número à parte (`extra`) que não é somado à barra (ex.: em andamento agora).
 */
export function HBarChart({
  rows,
  valueLabel,
  extraLabel,
}: {
  rows: { id: string; name: string; value: number; extra: number }[];
  valueLabel: string;
  extraLabel: string;
}) {
  const { max } = axis(Math.max(0, ...rows.map((r) => r.value)), { integer: true });
  const grid = "grid grid-cols-[7.5rem_1fr_4.5rem_8rem] items-center gap-3";
  return (
    <div className="flex flex-col gap-2.5">
      <div className={`${grid} whitespace-nowrap pl-2 text-xs text-text-muted`} aria-hidden="true">
        <span />
        <span />
        <span className="text-right">{valueLabel}</span>
        <span className="text-right">{extraLabel}</span>
      </div>
      <ul className="flex flex-col gap-2.5" aria-label={`${valueLabel} por pessoa`}>
        {rows.map((r) => (
          <li
            key={r.id}
            className={`${grid} border-l-2 border-transparent pl-2 text-sm transition-colors hover:border-chart-hover`}
            title={`${r.name}: ${r.value} ${valueLabel.toLowerCase()}, ${r.extra} ${extraLabel.toLowerCase()}`}
          >
            <span className="truncate text-text-primary">{r.name}</span>
            <span
              className="h-3 w-full bg-gradient-to-r from-chart-1 to-chart-2"
              style={{ clipPath: `inset(0 ${100 - (r.value / max) * 100}% 0 0 round 4px)` }}
            />
            <span className="text-right tabular-nums text-text-primary">{r.value}</span>
            <span className="text-right text-xs tabular-nums text-text-muted">{r.extra}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
