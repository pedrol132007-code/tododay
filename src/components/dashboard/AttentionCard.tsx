import type { DashboardTask } from "../../types";
import { ATTENTION_DIRECT_MAX, DUE_SOON_DAYS, OVERLOAD_IN_PROGRESS, STALLED_DAYS, type AlertKind, type AttentionAlert } from "../../lib/dashboardRules";
import { IconCheck } from "../ui/icons";

/** Selo de cada tipo: texto sempre presente; a bolinha só reforça (vermelho = mais grave). */
const BADGE: Record<AlertKind, { label: string; dot: string }> = {
  overdue: { label: "Atrasadas", dot: "bg-danger" },
  overload: { label: "Sobrecarga", dot: "bg-danger" },
  stalled: { label: "Paradas", dot: "bg-highlight" },
  dueSoon: { label: "Vence em breve", dot: "bg-highlight" },
};

/**
 * Bloco "Atenção": até 5 alertas gerados pelas regras (src/lib/dashboardRules.ts), do mais grave
 * para o menos grave. Clicar num alerta abre as tarefas que ele descreve (no board filtrado, quando dá);
 * com até ATTENTION_DIRECT_MAX tarefas, cada uma aparece embaixo e abre direto.
 */
export function AttentionCard({
  alerts,
  tasksOf,
  onOpen,
  onOpenTask,
  onOpenPerson,
  openLabel,
}: {
  alerts: AttentionAlert[];
  /** As tarefas que o alerta descreve. */
  tasksOf: (alert: AttentionAlert) => DashboardTask[];
  onOpen: (alert: AttentionAlert) => void;
  onOpenTask: (task: DashboardTask, alert: AttentionAlert) => void;
  /** O que o clique faz: "Ver no board" (abre o board filtrado) ou "Ver tarefas" (a lista aqui). */
  openLabel: string;
  /** Abre o detalhe da pessoa, onde estão os fatos que não couberam na frase. */
  onOpenPerson: (personId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-surface p-5">
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
        <span className="h-0.5 w-4 shrink-0 bg-danger" aria-hidden="true" />
        Atenção
      </h3>
      {alerts.length === 0 ? (
        <div className="flex items-center gap-3 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <IconCheck size={18} />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-text-primary">Nada pedindo atenção agora</span>
            <span className="text-xs text-text-muted">
              Nenhuma tarefa atrasada ou parada há mais de {STALLED_DAYS} dias, ninguém acima de {OVERLOAD_IN_PROGRESS} em andamento e
              nada vencendo nos próximos {DUE_SOON_DAYS} dias.
            </span>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col">
          {alerts.map((alert) => {
            const tasks = tasksOf(alert);
            return (
              <li key={alert.id} className="border-t border-border first:border-t-0">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onOpen(alert)}
                    className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-bg-elevated"
                  >
                    <span className="inline-flex w-36 shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${BADGE[alert.kind].dot}`} aria-hidden="true" />
                      {BADGE[alert.kind].label}
                    </span>
                    <span className="flex-1 text-sm text-text-primary">{alert.text}</span>
                    <span className="shrink-0 text-xs text-text-muted group-hover:text-primary">{openLabel} →</span>
                  </button>
                  {alert.more > 0 && alert.personId && (
                    <button
                      type="button"
                      onClick={() => onOpenPerson(alert.personId!)}
                      title="Ver todos os pontos no detalhe da pessoa"
                      className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs text-text-muted hover:border-primary hover:text-primary"
                    >
                      +{alert.more} {alert.more === 1 ? "ponto" : "pontos"}
                    </button>
                  )}
                </div>
                {tasks.length <= ATTENTION_DIRECT_MAX && (
                  // Alinhadas com o texto do alerta (depois do selo).
                  <ul className="flex flex-col pb-2 pl-[10.25rem]">
                    {tasks.map((task) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => onOpenTask(task, alert)}
                          className="group -mx-1.5 flex max-w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-xs text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          <span className="truncate">{task.title}</span>
                          <span className="shrink-0 opacity-0 group-hover:opacity-100">Abrir →</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
