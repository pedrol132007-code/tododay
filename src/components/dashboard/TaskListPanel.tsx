import { useEffect } from "react";
import { motion } from "framer-motion";
import type { DashboardPerson, DashboardTask } from "../../types";
import { isOverdue, stalledDays } from "../../lib/dashboardRules";
import { daysBetween, statusOn } from "../../lib/metrics";
import { Avatar } from "../ui/Avatar";
import { IconX } from "../ui/icons";

const STATUS_LABEL = { planned: "Planejada", in_progress: "Em andamento", done: "Concluída" } as const;

function dueText(t: DashboardTask, day: string): { text: string; late: boolean } | null {
  if (!t.dueDay) return null;
  const diff = daysBetween(day, t.dueDay);
  if (isOverdue(t, day)) return { text: `venceu há ${-diff} ${-diff === 1 ? "dia" : "dias"}`, late: true };
  if (diff === 0) return { text: "vence hoje", late: false };
  return { text: diff > 0 ? `vence em ${diff} ${diff === 1 ? "dia" : "dias"}` : "prazo cumprido", late: false };
}

/** Mais urgente primeiro: atrasadas (a mais vencida antes), depois as paradas há mais tempo, depois pelo prazo. */
function byUrgency(day: string) {
  return (a: DashboardTask, b: DashboardTask) => {
    const late = Number(isOverdue(b, day)) - Number(isOverdue(a, day));
    if (late) return late;
    const stalled = (stalledDays(b, day) ?? 0) - (stalledDays(a, day) ?? 0);
    if (stalled) return stalled;
    return (a.dueDay ?? "9999").localeCompare(b.dueDay ?? "9999");
  };
}

/**
 * Lista filtrada de tarefas (aberta por um alerta ou um número do dashboard). Na demonstração as
 * tarefas são fictícias e não existem no board, então a lista fica aqui mesmo.
 */
export function TaskListPanel({
  title,
  tasks,
  people,
  day,
  isDemo,
  onClose,
}: {
  title: string;
  tasks: DashboardTask[];
  people: DashboardPerson[];
  day: string;
  isDemo: boolean;
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
              {isDemo && " · demonstração: tarefas fictícias, não estão no board"}
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
              <li key={t.id} className="flex flex-col gap-1.5 rounded-xl border border-border bg-bg-card px-3 py-2.5">
                <span className="text-sm text-text-primary">{t.title}</span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar userId={t.assigneeId} name={nameOf(t.assigneeId)} />
                    {nameOf(t.assigneeId)}
                  </span>
                  {status && <span>{STATUS_LABEL[status]}</span>}
                  {due && <span className={due.late ? "font-semibold text-danger" : ""}>{due.text}</span>}
                  {stalled != null && <span className="font-semibold text-text-primary">parada há {stalled} dias</span>}
                </div>
              </li>
            );
          })}
        </ul>
      </motion.aside>
    </div>
  );
}
