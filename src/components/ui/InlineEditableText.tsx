import { useState } from "react";
import { EditActions } from "./EditActions";

interface InlineEditableTextProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  readOnly?: boolean;
  /** Mostra Salvar e Cancelar enquanto edita (painel do card); clicar fora continua salvando. */
  withButtons?: boolean;
}

export function InlineEditableText({ value, onSave, className, readOnly, withButtons }: InlineEditableTextProps) {
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

  if (readOnly) {
    return <span className={`px-2 py-1 ${className ?? ""}`}>{value}</span>;
  }

  if (editing) {
    const input = (
      <input
        autoFocus
        className={`rounded-lg border border-primary bg-bg-elevated px-2 py-1 text-text-primary outline-none ${withButtons ? "w-full" : ""} ${className ?? ""}`}
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
    if (!withButtons) return input;
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {input}
        <EditActions onSave={commit} onCancel={cancel} hint="Enter" />
      </div>
    );
  }

  return (
    <span className={`rounded-lg px-2 py-1 hover:bg-bg-elevated ${className ?? ""}`}>
      <span
        className="cursor-text"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </span>
    </span>
  );
}
