import { useState } from "react";
import type { PersonScore } from "../../lib/dashboard";
import { axis } from "../../lib/chartScale";
import { Avatar } from "../ui/Avatar";
import { Sparkline } from "./charts/Sparkline";
import { days, num, pct } from "./format";

type SortKey = "name" | "delivered" | "avgCycleDays" | "onTimeRate" | "inProgress";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Pessoa", align: "left" },
  { key: "delivered", label: "Entregas", align: "left" },
  { key: "avgCycleDays", label: "Tempo médio", align: "right" },
  { key: "onTimeRate", label: "No prazo", align: "right" },
  { key: "inProgress", label: "Em andamento", align: "right" },
];

function sortValue(r: PersonScore, key: SortKey): string | number | null {
  return key === "name" ? r.person.name : r[key];
}

/** Valor que, se destacado, diz em texto por quê (nunca só cor). */
function Flagged({ value, flagged, why }: { value: string; flagged: boolean; why: string }) {
  if (!flagged) return <>{value}</>;
  return (
    <span className="font-semibold" title={why}>
      <span className="text-danger" aria-hidden="true">▲ </span>
      {value}
      <span className="sr-only"> ({why})</span>
    </span>
  );
}

/**
 * Placar da equipe no período: uma linha por pessoa, colunas ordenáveis e destaque para quem está
 * bem pior que a equipe. Clicar numa linha abre a visão da pessoa.
 */
export function PersonScoreTable({ rows, onSelect }: { rows: PersonScore[]; onSelect: (id: string) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "delivered", desc: true });
  const { max } = axis(Math.max(0, ...rows.map((r) => r.delivered)), { integer: true });

  const sorted = [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1; // sem valor vai para o fim
    const cmp = typeof va === "string" ? va.localeCompare(vb as string, "pt-BR") : va - (vb as number);
    return sort.desc ? -cmp : cmp;
  });

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" && key !== "avgCycleDays" }));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-text-muted">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}
                  className={`pb-2 font-medium ${c.align === "right" ? "text-right" : "text-left"} ${c.key === "delivered" ? "pl-3" : ""}`}
                >
                  <button type="button" onClick={() => toggle(c.key)} className="whitespace-nowrap hover:text-text-primary">
                    {c.label}
                    <span aria-hidden="true" className={sort.key === c.key ? "" : "invisible"}>
                      {sort.desc ? " ↓" : " ↑"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.person.id}
                onClick={() => onSelect(r.person.id)}
                className="cursor-pointer border-t border-border transition-colors hover:bg-bg-elevated"
              >
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r.person.id);
                    }}
                    className="inline-flex items-center gap-2 whitespace-nowrap text-left text-text-primary hover:text-primary"
                  >
                    <Avatar userId={r.person.id} name={r.person.name} />
                    {r.person.name}
                  </button>
                </td>
                <td className="py-2 pl-3 pr-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-2.5 w-24 shrink-0 bg-gradient-to-r from-chart-1 to-chart-2"
                      style={{ clipPath: `inset(0 ${100 - (r.delivered / max) * 100}% 0 0 round 4px)` }}
                      aria-hidden="true"
                    />
                    <span className="w-7 text-right tabular-nums text-text-primary">{num(r.delivered)}</span>
                    <Sparkline values={r.weekly} width={56} height={20} />
                  </div>
                </td>
                <td className="py-2 pl-3 text-right tabular-nums text-text-primary">
                  <Flagged value={days(r.avgCycleDays)} flagged={r.flags.avgCycleDays} why="tempo bem acima da equipe" />
                </td>
                <td className="py-2 pl-3 text-right tabular-nums text-text-primary">
                  <Flagged value={pct(r.onTimeRate)} flagged={r.flags.onTimeRate} why="no prazo bem abaixo da equipe" />
                </td>
                <td className="py-2 pl-3 text-right tabular-nums text-text-primary">
                  <Flagged value={num(r.inProgress)} flagged={r.flags.inProgress} why="em andamento bem acima da equipe" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted">
        <span className="text-danger" aria-hidden="true">▲</span> bem pior que a equipe · clique numa pessoa para ver o detalhe
      </p>
    </div>
  );
}
