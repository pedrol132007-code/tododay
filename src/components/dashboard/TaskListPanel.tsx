import { useEffect } from "react";
import { motion } from "framer-motion";
import type { DashboardPerson, DashboardTask } from "../../types";
import { isOverdue, stalledDays } from "../../lib/dashboardRules";
import { completedDay, daysBetween, statusOn } from "../../lib/metrics";
import { Avatar } from "../ui/Avatar";
import { IconX } from "../ui/icons";

const STATUS_LABEL = { planned: "Planejada", in_progress: "Em andamento", done: "Concluída" } as const;

function dueText(t: DashboardTask, day: string): { text: string; late: boolean } | null {
  if (!t.dueDay) return null;
  const done = completedDay(t);
  if (done && done <= day) {
    const after = daysBetween(t.dueDay, done);
    return after > 0 ? { text: `entregue ${after} ${after === 1 ? "dia" : "dias"} após o prazo`, late: true } : { text: "entregue no prazo", late: false };
  }
  const diff = daysBetween(day, t.dueDay);
  if (isOverdue(t, day)) return { text: `venceu há ${-diff} ${-diff === 1 ? "dia" : "dias"}`, late: true };
  if (diff === 0) return { text: "vence hoje", late: false };
  return { text: `vence em ${diff} ${diff === 1 ? "dia" : "dias"}`, late: false };
}

/**
 * Abertas antes das concluídas. Abertas: atrasadas (a mais vencida antes), depois as paradas há mais
 * tempo, depois pelo prazo. Concluídas: a entrega mais recente primeiro.
 */
function byUrgency(day: string) {
  return (a: DashboardTask, b: DashboardTask) => {
    // Concluída depois do dia da lista ainda estava aberta naquele dia.
    const doneBy = (t: DashboardTask) => {
      const done = completedDay(t);
      return done && done <= day ? done : null;
    };
    const doneA = doneBy(a), doneB = doneBy(b);
    if (doneA || doneB) return doneA && doneB ? doneB.localeCompare(doneA) : doneA ? 1 : -1;
    const late = Number(isOverdue(b, day)) - Number(isOverdue(a, day));
    if (late) return late;
    const stalled = (stalledDays(b, day) ?? 0) - (stalledDays(a, day) ?? 0);
    if (stalled) return stalled;
    return (a.dueDay ?? "9999").localeCompare(b.dueDay ?? "9999");
  };
}

/**
 * Lista filtrada de tarefas (aberta por um alerta ou um número do dashboard). Cada tarefa abre no
 * board (`onOpenTask`). Na demonstração as tarefas são fictícias, as mesmas do board de demonstração.
 */
export function TaskListPanel({
  title,
  tasks,
  people,
  day,
  isDemo,
  onOpenTask,
  onClose,
}: {
  title: string;
  tasks: DashboardTask[];
  people: DashboardPerson[];
  day: string;
  isDemo: boolean;
  onOpenTask: (task: DashboardTask) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sorted = [...tasks].sort(byUrgency(day));
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "?";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <motion.aside
        role="dialog"
        aria-label={title}
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 32, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-border bg-bg-surface px-6 pb-6"
      >
        <div className="-mx-6 h-1 shrink-0 bg-brand-gradient" />
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-normal leading-tight tracking-tight text-text-primary">{title}</h2>
            <span className="text-xs text-text-muted">
              {sorted.length} {sorted.length === 1 ? "tarefa" : "tarefas"}
              {isDemo && " · demonstração: tarefas fictícias"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label="Fechar lista"
          >
            <IconX size={18} />
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {sorted.map((t) => {
            const due = dueText(t, day);
            const stalled = stalledDays(t, day);
            const status = statusOn(t, day);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onOpenTask(t)}
                  className="group flex w-full flex-col gap-1.5 rounded-xl border border-border bg-bg-card px-3 py-2.5 text-left transition-colors hover:border-primary"
                >
                  <span className="flex items-start justify-between gap-2 text-sm text-text-primary">
                    {t.title}
                    <span className="shrink-0 text-xs text-text-muted opacity-0 group-hover:text-primary group-hover:opacity-100">Abrir no board →</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar userId={t.assigneeId} name={nameOf(t.assigneeId)} />
                      {nameOf(t.assigneeId)}
                    </span>
                    {status && <span>{STATUS_LABEL[status]}</span>}
                    {due && <span className={due.late ? "font-semibold text-danger" : ""}>{due.text}</span>}
                    {stalled != null && <span className="font-semibold text-text-primary">parada há {stalled} {stalled === 1 ? "dia" : "dias"}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </motion.aside>
    </div>
  );
}
