import { useState } from "react";

interface InlineEditableTextProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
  // Titles must never be blank, so by default an empty edit is discarded; optional fields
  // (a member's role, contact, notes) opt in to being cleared.
  allowEmpty?: boolean;
}

export function InlineEditableText({ value, onSave, className, placeholder, allowEmpty = false }: InlineEditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    const trimmed = draft.trim();
    if ((trimmed || allowEmpty) && trimmed !== value) {
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
        placeholder={placeholder}
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
    <span className={`rounded-lg px-2 py-1 hover:bg-bg-elevated ${className ?? ""}`}>
      <span
        className={`cursor-text ${value ? "" : "italic text-text-muted"}`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || placeholder}
      </span>
    </span>
  );
}
