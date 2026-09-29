import { useEffect, useRef, useState } from "react";
import type { List, ListStatus } from "../../types";
import { useUpdateListSettings } from "../../hooks/useLists";
import { useListAttachmentTotals } from "../../hooks/useAttachments";
import { formatBytes, LIST_STATUS_LABEL } from "../../lib/boardVisuals";
import { IconDots, IconTrash } from "../ui/icons";

const STATUSES: ListStatus[] = ["todo", "doing", "done"];

/** Configurações da coluna: tipo por trás do nome (base das métricas), limite de WIP e excluir. */
export function ListMenu({ list, canDelete, onDelete }: { list: List; canDelete: boolean; onDelete: () => void }) {
  const updateSettings = useUpdateListSettings(list.board_id);
  const [open, setOpen] = useState(false);
  const [wipDraft, setWipDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Cards arquivados da coluna somem junto com ela, e os anexos deles também.
  const { data: attachments } = useListAttachmentTotals(list.id, open && canDelete);

  useEffect(() => {
    if (!open) return setConfirming(false);
    setWipDraft(list.wip_limit == null ? "" : String(list.wip_limit));
    function handleClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, list.wip_limit]);

  function saveWip() {
    const n = Number.parseInt(wipDraft, 10);
    const limit = wipDraft.trim() === "" || !Number.isFinite(n) || n < 1 ? null : n;
    if (limit !== list.wip_limit) updateSettings.mutate({ id: list.id, wip_limit: limit });
    setWipDraft(limit == null ? "" : String(limit));
  }

  return (
    // O cabeçalho da coluna é a alça de arrastar (mouse e teclado): o menu não pode começar um arrasto.
    <div
      ref={ref}
      className="relative"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Configurações da coluna ${list.name}`}
        aria-expanded={open}
        title="Configurações da coluna"
        className="rounded-lg p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
      >
        <IconDots size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-60 cursor-default rounded-xl border border-border bg-bg-surface p-2 shadow-lg">
          <fieldset className="flex flex-col gap-0.5">
            <legend className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">Tipo</legend>
            {STATUSES.map((status) => (
              <label
                key={status}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-text-primary hover:bg-bg-elevated"
              >
                <input
                  type="radio"
                  name={`list-status-${list.id}`}
                  checked={list.status === status}
                  onChange={() => updateSettings.mutate({ id: list.id, status })}
                  className="accent-primary"
                />
                {LIST_STATUS_LABEL[status]}
              </label>
            ))}
            <span className="px-2 pt-1 text-xs text-text-muted">O dashboard conta as tarefas pelo tipo, não pelo nome.</span>
          </fieldset>

          <label className="mt-3 flex flex-col gap-1 border-t border-border px-2 pt-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            Limite de WIP
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={wipDraft}
              onChange={(e) => setWipDraft(e.target.value)}
              onBlur={saveWip}
              onKeyDown={(e) => e.key === "Enter" && saveWip()}
              placeholder="Sem limite"
              className="w-full rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm font-normal normal-case tracking-normal text-text-primary outline-none focus:border-primary"
            />
            <span className="font-normal normal-case tracking-normal">Acima do limite o contador fica em alerta; nada é bloqueado.</span>
          </label>

          <div className="mt-3 border-t border-border pt-2">
            {confirming && attachments && (
              <p role="alert" className="px-2 pb-2 text-xs text-danger">
                Excluir a coluna apaga também {attachments.count === 1 ? "1 anexo" : `${attachments.count} anexos`} ({formatBytes(attachments.bytes)}) de cards
                arquivados nela. Não dá para desfazer.
              </p>
            )}
            <button
              type="button"
              disabled={!canDelete}
              onClick={() => {
                if (attachments && attachments.count > 0 && !confirming) return setConfirming(true);
                setOpen(false);
                onDelete();
              }}
              title={canDelete ? undefined : "Mova ou arquive os cards antes de excluir"}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-danger hover:bg-danger hover:text-on-accent disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-danger"
            >
              <IconTrash size={14} /> {confirming ? "Confirmar exclusão" : "Excluir coluna"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
