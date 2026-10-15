interface EditActionsProps {
  onSave: () => void;
  onCancel: () => void;
  /** Atalho que também salva, mostrado ao lado dos botões. */
  hint: string;
}

/** Salvar e Cancelar de um campo em edição. O campo salva ao perder o foco, então os botões não
 *  podem tirá-lo (preventDefault no mousedown): senão Cancelar salvaria antes de cancelar. */
export function EditActions({ onSave, onCancel, hint }: EditActionsProps) {
  return (
    <div className="flex items-center gap-3" onMouseDown={(e) => e.preventDefault()}>
      <button type="button" onClick={onSave} className="btn-primary px-3 py-1.5">
        Salvar
      </button>
      <button type="button" onClick={onCancel} className="text-sm text-text-muted hover:text-text-primary">
        Cancelar
      </button>
      <span className="ml-auto text-xs text-text-muted">{hint}</span>
    </div>
  );
}
