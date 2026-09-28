import type { DashboardTask } from "../../types";
import { STALLED_DAYS } from "../../lib/dashboardRules";
import { daysBetween } from "../../lib/metrics";
import { IconCheck } from "../ui/icons";

/** Quantas mostrar aqui; o resto abre na lista completa. */
const VISIBLE = 8;
const daysText = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/**
 * O que está parado e há quanto tempo, na visão de uma pessoa: pensado para preparar a conversa
 * individual (fatos, o mais antigo primeiro).
 */
export function StalledSection({
  items,
  day,
  onOpenAll,
}: {
  items: { task: DashboardTask; days: number }[];
  day: string;
  onOpenAll: () => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-surface p-5">
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
        <span className="h-0.5 w-4 shrink-0 bg-danger" aria-hidden="true" />
        Parado há mais de {STALLED_DAYS} dias
      </h3>
      {items.length === 0 ? (
        <div className="flex items-center gap-3 py-1">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <IconCheck size={18} />
          </span>
          <span className="text-sm text-text-primary">Nada parado: tudo que está em andamento mudou de status nos últimos {STALLED_DAYS} dias.</span>
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.slice(0, VISIBLE).map(({ task, days }) => {
            const late = task.dueDay != null && task.dueDay < day;
            return (
              <li key={task.id} className="flex items-center gap-4 border-t border-border py-2 first:border-t-0">
                <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-text-primary">há {daysText(days)}</span>
                <span className="flex-1 text-sm text-text-primary">{task.title}</span>
                <span className={`shrink-0 text-xs ${late ? "font-semibold text-danger" : "text-text-muted"}`}>
                  {task.dueDay == null
                    ? "sem prazo"
                    : late
                      ? `prazo vencido há ${daysText(daysBetween(task.dueDay, day))}`
                      : task.dueDay === day
                        ? "prazo hoje"
                        : `prazo em ${daysText(daysBetween(day, task.dueDay))}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > VISIBLE && (
        <button type="button" onClick={onOpenAll} className="self-start text-sm text-primary hover:underline">
          Ver todas as {items.length} →
        </button>
      )}
    </section>
  );
}
