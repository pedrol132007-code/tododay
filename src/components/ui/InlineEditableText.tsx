import { useState } from "react";

interface InlineEditableTextProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
}

export function InlineEditableText({ value, onSave, className }: InlineEditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        className={`rounded-lg border border-accent-purple bg-bg-elevated px-2 py-1 text-text-primary outline-none ${className ?? ""}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") cancel();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={`rounded-lg px-2 py-1 hover:bg-bg-elevated ${className ?? ""}`}
      onDoubleClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      <span className="cursor-text">{value}</span>
    </span>
  );
}
