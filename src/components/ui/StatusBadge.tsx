import type { CardStatus } from "../../types";
import { STATUS_COLORS, STATUS_LABELS } from "../../lib/status";

export function StatusBadge({ status }: { status: CardStatus }) {
  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: STATUS_COLORS[status] }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
      {STATUS_LABELS[status]}
    </span>
  );
}
