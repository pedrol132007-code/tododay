import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownEditorProps {
  value: string;
  onSave: (value: string) => void;
  onSaveAndClose: () => void;
}

export function MarkdownEditor({ value, onSave, onSaveAndClose }: MarkdownEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    if (draft !== value) onSave(draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
          if (e.ctrlKey && e.key === "Enter") {
            if (draft !== value) onSave(draft);
            onSaveAndClose();
          }
        }}
        placeholder="Descrição em markdown..."
        className="min-h-[160px] w-full rounded-lg border border-accent-purple bg-bg-elevated p-3 text-sm text-text-primary outline-none"
      />
    );
  }

  return (
    <div
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="min-h-[80px] cursor-text rounded-lg border border-transparent p-3 text-sm text-text-primary hover:border-border hover:bg-bg-elevated"
    >
      {value.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      ) : (
        <span className="text-text-muted">Adicionar descrição...</span>
      )}
    </div>
  );
}
