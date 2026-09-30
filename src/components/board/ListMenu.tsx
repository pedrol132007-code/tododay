import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { List, ListStatus } from "../../types";
import { useUpdateListSettings } from "../../hooks/useLists";
import { useListAttachmentTotals } from "../../hooks/useAttachments";
import { formatBytes, LIST_STATUS_LABEL } from "../../lib/boardVisuals";
import { IconDots, IconTrash } from "../ui/icons";

const STATUSES: ListStatus[] = ["todo", "doing", "done"];

const MENU_WIDTH = 240; // w-60
/** Altura do menu inteiro; com menos espaço embaixo do que isso (e mais em cima), abre para cima. */
const MENU_HEIGHT = 340;
const GAP = 4;
const EDGE = 8;

/**
 * Onde o menu abre, na tela. Vai para o <body> (portal): dentro da linha do board ele era cortado
 * pela rolagem dela (overflow), e a coluna tem transform, então nem `fixed` escapava. Sem espaço
 * embaixo abre para cima; sem espaço nenhum, rola por dentro.
 */
function menuPosition(button: HTMLElement): CSSProperties {
  const r = button.getBoundingClientRect();
  const left = Math.max(EDGE, r.right - MENU_WIDTH);
  const below = window.innerHeight - r.bottom - GAP - EDGE;
  const above = r.top - GAP - EDGE;
  if (below >= MENU_HEIGHT || below >= above) return { left, top: r.bottom + GAP, maxHeight: below };
  return { left, bottom: window.innerHeight - r.top + GAP, maxHeight: above };
}

/** Configurações da coluna: tipo por trás do nome (base das métricas), limite de WIP e excluir. */
export function ListMenu({ list, canDelete, onDelete }: { list: List; canDelete: boolean; onDelete: () => void }) {
  const updateSettings = useUpdateListSettings(list.board_id);
  const [open, setOpen] = useState(false);
  const [wipDraft, setWipDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Cards arquivados da coluna somem junto com ela, e os anexos deles também.
  const { data: attachments } = useListAttachmentTotals(list.id, open && canDelete);

  useEffect(() => {
    if (!open) return setConfirming(false);
    setWipDraft(list.wip_limit == null ? "" : String(list.wip_limit));
    const inside = (target: EventTarget | null) => ref.current?.contains(target as Node) || menuRef.current?.contains(target as Node);
    function handleClick(e: MouseEvent) {
      if (!inside(e.target)) setOpen(false);
    }
    // A posição é da tela: se o board rola ou a janela muda, fecha em vez de ficar no lugar errado.
    function handleScroll(e: Event) {
      if (!inside(e.target)) setOpen(false);
    }
    const close = () => setOpen(false);
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open, list.wip_limit]);

  function toggle() {
    if (!open && buttonRef.current) setPosition(menuPosition(buttonRef.current));
    setOpen((o) => !o);
  }

  function saveWip() {
    const n = Number.parseInt(wipDraft, 10);
    const limit = wipDraft.trim() === "" || !Number.isFinite(n) || n < 1 ? null : n;
    if (limit !== list.wip_limit) updateSettings.mutate({ id: list.id, wip_limit: limit });
    setWipDraft(limit == null ? "" : String(limit));
  }

  return (
    // O cabeçalho da coluna é a alça de arrastar (mouse e teclado): o menu não pode começar um arrasto.
    // O menu fica num portal, mas os eventos dele sobem pela árvore do React e param aqui também.
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
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={`Configurações da coluna ${list.name}`}
        aria-expanded={open}
        title="Configurações da coluna"
        className="rounded-lg p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
      >
        <IconDots size={14} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={position}
            className="fixed z-40 flex w-60 cursor-default flex-col rounded-xl border border-border bg-bg-surface p-2 shadow-lg"
          >
            {/* Sem espaço, só esta parte rola: o Excluir fica sempre à vista, embaixo. */}
            <div className="min-h-0 overflow-y-auto">
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

            </div>

            <div className="mt-3 shrink-0 border-t border-border pt-2">
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
          </div>,
          document.body,
        )}
    </div>
  );
}
