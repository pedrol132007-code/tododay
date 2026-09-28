import { axis } from "../../lib/chartScale";
import { OVERLOAD_IN_PROGRESS, STALLED_DAYS } from "../../lib/dashboardRules";
import type { PersonLoad } from "../../lib/teamLoad";
import { Avatar } from "../ui/Avatar";
import { num, pct } from "./format";

export type LoadList = "inProgress" | "overdue" | "stalled";

/** Número que abre a lista das tarefas que ele conta (zero não abre nada). */
function Count({ value, risk, label, onOpen }: { value: number; risk?: boolean; label: string; onOpen: () => void }) {
  const tone = risk ? (value > 0 ? "font-semibold text-danger" : "text-text-muted") : "text-text-primary";
  if (value === 0) return <span className={tone}>{num(value)}</span>;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation(); // a linha abre a pessoa; o número abre as tarefas
        onOpen();
      }}
      className={`rounded px-1 tabular-nums underline decoration-dotted underline-offset-4 hover:bg-bg-surface hover:text-primary ${tone}`}
    >
      {num(value)}
    </button>
  );
}

/**
 * Carga da equipe: tarefas em andamento por pessoa (barra, com o limite de sobrecarga tracejado),
 * atrasadas, paradas, no prazo e entregas. A ordem vem pronta (risco); sem posição nem destaque de
 * "melhor". Clicar numa pessoa abre a visão dela.
 */
export function TeamLoadTable({
  rows,
  onSelect,
  onOpenList,
}: {
  rows: PersonLoad[];
  onSelect: (id: string) => void;
  onOpenList: (row: PersonLoad, list: LoadList) => void;
}) {
  const { max } = axis(Math.max(OVERLOAD_IN_PROGRESS + 2, ...rows.map((r) => r.inProgress)), { integer: true });
  const limitAt = `${(OVERLOAD_IN_PROGRESS / max) * 100}%`;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-text-muted">
              <th scope="col" className="pb-2 pr-3 text-left font-medium">Pessoa</th>
              <th scope="col" className="w-full min-w-[14rem] pb-2 pl-3 pr-3 text-left font-medium">Em andamento (tarefas)</th>
              <th scope="col" className="whitespace-nowrap pb-2 pl-3 text-right font-medium">Atrasadas</th>
              <th scope="col" className="whitespace-nowrap pb-2 pl-3 text-right font-medium">Paradas +{STALLED_DAYS} dias</th>
              <th scope="col" className="whitespace-nowrap pb-2 pl-3 text-right font-medium">No prazo</th>
              <th scope="col" className="whitespace-nowrap pb-2 pl-3 text-right font-medium">Entregas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                    <div className="relative h-2.5 flex-1" aria-hidden="true">
                      <div className="absolute inset-0 rounded bg-bg-elevated" />
                      <div className="absolute inset-y-0 left-0 rounded bg-chart-1" style={{ width: `${(r.inProgress / max) * 100}%` }} />
                      <div className="absolute -inset-y-1 border-l border-dashed border-text-muted" style={{ left: limitAt }} />
                    </div>
                    <span className="w-8 text-right">
                      <Count value={r.inProgress} label={`Ver as ${r.inProgress} em andamento de ${r.person.name}`} onOpen={() => onOpenList(r, "inProgress")} />
                    </span>
                    <span className={`w-28 whitespace-nowrap text-xs ${r.overloaded ? "font-semibold text-danger" : "invisible"}`}>
                      acima do limite
                    </span>
                  </div>
                </td>
                <td className="py-2 pl-3 text-right tabular-nums">
                  <Count value={r.overdue} risk label={`Ver as ${r.overdue} atrasadas de ${r.person.name}`} onOpen={() => onOpenList(r, "overdue")} />
                </td>
                <td className="py-2 pl-3 text-right tabular-nums">
                  <Count value={r.stalled} risk label={`Ver as ${r.stalled} paradas de ${r.person.name}`} onOpen={() => onOpenList(r, "stalled")} />
                </td>
                <td className="py-2 pl-3 text-right tabular-nums text-text-primary">{pct(r.onTimeRate)}</td>
                <td className="py-2 pl-3 text-right tabular-nums text-text-primary">{num(r.delivered)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted">
        Ordem por risco: mais atrasadas primeiro, depois mais carga. Carga é contagem de tarefas em andamento (não há estimativa
        de esforço). Tracejado: limite de sobrecarga ({OVERLOAD_IN_PROGRESS} tarefas). Clique num número para ver as tarefas, ou na pessoa para ver o dashboard dela.
      </p>
    </div>
  );
}
