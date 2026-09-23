import type { CardStatus } from "../../types";
import { STATUS_COLORS, STATUS_LABELS } from "../../lib/status";

export function StatusBadge({ status, compact = false }: { status: CardStatus; compact?: boolean }) {
  const dot = <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />;
  if (compact) {
    return (
      <span className="flex items-center" title={STATUS_LABELS[status]} aria-label={STATUS_LABELS[status]}>
        {dot}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: STATUS_COLORS[status] }}>
      {dot}
      {STATUS_LABELS[status]}
    </span>
  );
}
