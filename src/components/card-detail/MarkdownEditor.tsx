import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// O reset do Tailwind tira marcadores e espaçamentos; devolve o básico ao markdown renderizado.
const markdownClass =
  "[&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-bg-elevated [&_code]:px-1 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+*]:mt-2 [&_ul]:list-disc [&_ul]:pl-5";

interface MarkdownEditorProps {
  value: string;
  onSave: (value: string) => void;
  onSaveAndClose: () => void;
  readOnly?: boolean;
}

export function MarkdownEditor({ value, onSave, onSaveAndClose, readOnly }: MarkdownEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    if (draft !== value) onSave(draft);
    setEditing(false);
  }

  if (readOnly) {
    return (
      <div className={`min-h-[80px] p-3 text-sm text-text-primary ${markdownClass}`}>
        {value.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
        ) : (
          <span className="text-text-muted">Sem descrição.</span>
        )}
      </div>
    );
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
        className="min-h-[160px] w-full rounded-lg border border-primary bg-bg-elevated p-3 text-sm text-text-primary outline-none"
      />
    );
  }

  return (
    <div
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`min-h-[80px] cursor-text rounded-lg border border-transparent p-3 text-sm text-text-primary hover:border-border hover:bg-bg-elevated ${markdownClass}`}
    >
      {value.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
      ) : (
        <span className="text-text-muted">Adicionar descrição...</span>
      )}
    </div>
  );
}
