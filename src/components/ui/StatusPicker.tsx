import type { CardStatus } from "../../types";
import { CARD_STATUSES, STATUS_COLORS, STATUS_LABELS } from "../../lib/status";

interface StatusPickerProps {
  value: CardStatus;
  onChange: (status: CardStatus) => void;
}

export function StatusPicker({ value, onChange }: StatusPickerProps) {
  return (
    <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-1">
      {CARD_STATUSES.map((status) => {
        const selected = status === value;
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(status)}
            style={selected ? { borderColor: STATUS_COLORS[status], color: STATUS_COLORS[status] } : undefined}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
              selected ? "bg-bg-base" : "border-border text-text-muted hover:text-text-primary"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
            {STATUS_LABELS[status]}
          </button>
        );
      })}
    </div>
  );
}
