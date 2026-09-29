import { formatDue } from "../../lib/boardVisuals";
import { dueRisk, localDay, type DueRisk } from "../../lib/dashboardRules";
import { daysBetween } from "../../lib/metrics";
import { IconCalendar } from "./icons";

const DUE_STYLE: Record<DueRisk | "none", string> = {
  overdue: "bg-danger text-on-accent",
  soon: "bg-highlight text-black",
  none: "border border-border text-text-muted",
};

function dueTitle(risk: DueRisk | null, due: string, today: string): string {
  if (risk === "overdue") return "Atrasado";
  const days = daysBetween(today, due);
  if (days === 0) return "Vence hoje";
  return days === 1 ? "Vence amanhã" : `Vence em ${days} dias`;
}

/**
 * Selo com a data de vencimento, pelas regras do bloco Atenção (src/lib/dashboardRules.ts): vermelho
 * se atrasado, laranja se vence em até DUE_SOON_DAYS dias. `done` (coluna concluída) nunca alerta.
 */
export function DueBadge({ due, withLabel = false, done = false }: { due: string; withLabel?: boolean; done?: boolean }) {
  const now = new Date();
  const today = localDay(now);
  const risk = done ? null : dueRisk(due, today);
  const date = formatDue(due, now);
  const title = done ? `Prazo ${date}` : `${dueTitle(risk, due, today)} · ${date}`;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[11px] font-medium ${DUE_STYLE[risk ?? "none"]}`}
    >
      <IconCalendar size={12} />
      {withLabel && risk ? `${dueTitle(risk, due, today)} · ${date}` : date}
    </span>
  );
}
