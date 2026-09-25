import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useCardLabels,
  useCreateLabel,
  useDeleteLabel,
  useLabels,
  useSetCardLabel,
} from "../../hooks/useLabels";
import { useCanEdit } from "../../hooks/useCurrentTeam";
import { readableTextOn } from "../../lib/contrast";
import { IconPlus, IconTrash, IconX } from "../ui/icons";

interface LabelPickerProps {
  boardId: number;
  cardId: number;
}

export function LabelPicker({ boardId, cardId }: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#2538ff");

  const { data: cardLabels } = useCardLabels(cardId);
  const { data: boardLabels } = useLabels(boardId);
  const createLabel = useCreateLabel(boardId);
  const deleteLabel = useDeleteLabel(boardId);
  const setCardLabel = useSetCardLabel(cardId);
  const canEdit = useCanEdit();

  const cardLabelIds = new Set((cardLabels ?? []).map((l) => l.id));

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    createLabel.mutate({ name, color: newColor });
    setNewName("");
  }

  return (
    <div className="flex flex-col gap-1 text-sm text-text-muted">
      <span>Labels</span>
      <div className="flex flex-wrap items-center gap-2">
        {(cardLabels ?? []).map((label) => (
          <span
            key={label.id}
            style={{ backgroundColor: label.color, color: readableTextOn(label.color) }}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
          >
            {label.name}
            {canEdit && (
              <button
                type="button"
                onClick={() => setCardLabel.mutate({ labelId: label.id, on: false })}
                aria-label={`Remover label ${label.name}`}
                className="flex hover:opacity-70"
              >
                <IconX size={12} />
              </button>
            )}
          </span>
        ))}
        {canEdit ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-text-primary hover:bg-bg-elevated"
          >
            <IconPlus size={12} /> Labels
          </button>
        ) : (
          (cardLabels ?? []).length === 0 && <span className="text-xs">Nenhuma.</span>
        )}
      </div>

      <AnimatePresence>
        {open && canEdit && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-bg-elevated p-3"
          >
            {(boardLabels ?? []).map((label) => (
              <div key={label.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCardLabel.mutate({ labelId: label.id, on: !cardLabelIds.has(label.id) })}
                  style={{ backgroundColor: label.color, color: readableTextOn(label.color) }}
                  className={`flex-1 rounded-lg px-2 py-1 text-left text-xs ${
                    cardLabelIds.has(label.id) ? "ring-2 ring-highlight" : ""
                  }`}
                >
                  {label.name}
                </button>
                <button
                  type="button"
                  onClick={() => deleteLabel.mutate(label.id)}
                  aria-label={`Excluir label ${label.name}`}
                  className="text-text-muted hover:text-danger"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            ))}

            <div className="flex items-center gap-2 pt-1">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="h-7 w-8 shrink-0 rounded border border-border bg-transparent"
                aria-label="Cor da nova label"
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Nova label..."
                className="flex-1 rounded-lg border border-border bg-bg-surface px-2 py-1 text-xs text-text-primary outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleCreate}
                className="btn-primary px-2 py-1"
              >
                Adicionar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
