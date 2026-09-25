import { dueState, formatDue, type DueState } from "../../lib/boardVisuals";
import { IconCalendar } from "./icons";

const DUE_STYLE: Record<DueState, string> = {
  overdue: "bg-danger text-on-accent",
  today: "bg-highlight text-black",
  upcoming: "border border-border text-text-muted",
};

const DUE_TITLE: Record<DueState, string> = {
  overdue: "Atrasado",
  today: "Vence hoje",
  upcoming: "Vence em",
};

/** Selo com a data de vencimento: vermelho se atrasado, laranja se vence hoje. */
export function DueBadge({ due, withLabel = false }: { due: string; withLabel?: boolean }) {
  const today = new Date();
  const state = dueState(due, today)!;
  const date = formatDue(due, today);
  return (
    <span
      title={`${DUE_TITLE[state]} ${date}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[11px] font-medium ${DUE_STYLE[state]}`}
    >
      <IconCalendar size={12} />
      {withLabel && state !== "upcoming" ? DUE_TITLE[state] : date}
    </span>
  );
}
