import { useState } from "react";
import {
  useChecklistItems,
  useCreateChecklistItem,
  useDeleteChecklistItem,
  useToggleChecklistItem,
} from "../../hooks/useChecklistItems";
import { useCanEdit } from "../../hooks/useCurrentTeam";
import { IconPlus, IconX } from "../ui/icons";
import { PanelSection } from "./PanelSection";

interface ChecklistProps {
  cardId: number;
}

export function Checklist({ cardId }: ChecklistProps) {
  const { data: items } = useChecklistItems(cardId);
  const createItem = useCreateChecklistItem(cardId);
  const toggleItem = useToggleChecklistItem(cardId);
  const deleteItem = useDeleteChecklistItem(cardId);
  const [newText, setNewText] = useState("");
  const canEdit = useCanEdit();

  const done = (items ?? []).filter((i) => i.done).length;
  const total = items?.length ?? 0;

  function handleAdd() {
    const text = newText.trim();
    if (!text) return;
    createItem.mutate(text);
    setNewText("");
  }

  return (
    <PanelSection title="Checklist" aside={total > 0 ? `${done}/${total}` : undefined}>

      {total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        {(items ?? []).map((item) => (
          <div key={item.id} className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-bg-elevated">
            <input
              type="checkbox"
              checked={item.done}
              disabled={!canEdit}
              onChange={(e) => toggleItem.mutate({ id: item.id, done: e.target.checked })}
              className="accent-primary"
            />
            <span className={`flex-1 text-sm ${item.done ? "text-text-muted line-through" : "text-text-primary"}`}>
              {item.text}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => deleteItem.mutate(item.id)}
                aria-label="Excluir item"
                className="text-text-muted hover:text-danger"
              >
                <IconX size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Novo item..."
            className="flex-1 rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="btn-primary px-2.5 py-1.5"
            aria-label="Adicionar item"
          >
            <IconPlus size={16} />
          </button>
        </div>
      )}
    </PanelSection>
  );
}
