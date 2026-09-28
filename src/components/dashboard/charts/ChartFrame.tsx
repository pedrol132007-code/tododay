import { useState, type ReactNode } from "react";
import { STROKE, type ChartColor } from "./colors";

export interface LegendItem {
  label: string;
  color: ChartColor;
  dashed?: boolean;
}

/** Moldura dos gráficos: título, legenda e alternância para ver os mesmos números em tabela. */
export function ChartFrame({
  title,
  legend,
  table,
  children,
}: {
  title: string;
  legend?: LegendItem[];
  table: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-bg-surface p-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-4">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <button type="button" onClick={() => setAsTable((v) => !v)} className="ml-auto shrink-0 text-xs text-text-muted hover:text-primary">
            {asTable ? "Ver gráfico" : "Ver tabela"}
          </button>
        </div>
        {legend && legend.length > 1 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
            {legend.map((item) => (
              <li key={item.label} className="inline-flex items-center gap-1.5">
                <svg width="16" height="6" aria-hidden="true">
                  <line x1="0" y1="3" x2="16" y2="3" strokeWidth="2" className={STROKE[item.color]} strokeDasharray={item.dashed ? "4 4" : undefined} />
                </svg>
                {item.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {asTable ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-bg-surface text-text-muted">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} className="py-1 pr-3 font-medium">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-text-primary">
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {r.map((cell, j) => (
                    <td key={j} className="py-1 pr-3 tabular-nums">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
