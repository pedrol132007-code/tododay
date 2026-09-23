import type { Member } from "../../types";

interface MemberSelectProps {
  value: number | null;
  onChange: (memberId: number | null) => void;
  members: Member[];
}

export function MemberSelect({ value, onChange, members }: MemberSelectProps) {
  const selected = members.find((m) => m.id === value);
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: selected?.color ?? "transparent" }}
      />
      <select
        aria-label="Pedido por"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="min-w-0 flex-1 rounded-lg border border-border bg-bg-elevated px-2 py-1 text-xs text-text-primary outline-none focus:border-accent"
      >
        <option value="">Pedido por —</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
