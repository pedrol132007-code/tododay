import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CardPriority } from "../../types";
import { EMPTY_FILTERS, hasFilters, type BoardFilters, type BoardSort, type ColumnFilter, type DueFilter } from "../../lib/boardFilters";
import { PRIORITIES, PRIORITY_LABEL } from "../../lib/boardVisuals";
import { DUE_SOON_DAYS, STALLED_DAYS } from "../../lib/dashboardRules";
import { IconChevronDown, IconSearch, IconX } from "../ui/icons";

const DUE_LABEL: Record<DueFilter, string> = { overdue: "Atrasadas", soon: `Vencem em até ${DUE_SOON_DAYS} dias` };
/** Nas opções o texto é curto, para o seletor não esticar; o chip mostra a frase inteira. */
const DUE_OPTION: Record<DueFilter, string> = { overdue: "Atrasadas", soon: `Vencem em ${DUE_SOON_DAYS} dias` };
/** Tipo da coluna (o mesmo que o dashboard conta como "em andamento" e "abertas"). */
const COLUMN_OPTION: Record<ColumnFilter, string> = { doing: "Em andamento", open: "Abertas" };
const COLUMN_LABEL: Record<ColumnFilter, string> = { doing: "Colunas em andamento", open: "Abertas (fora de Concluído)" };
const SORT_LABEL: Record<BoardSort, string> = { manual: "Ordem do board", priority: "Prioridade", due: "Prazo mais próximo", stalled: "Parada há mais tempo" };
/** Opções de "paradas há mais de N dias"; a do meio é o limite do Atenção. */
const STALLED_OPTIONS = [3, STALLED_DAYS, 14];

export interface ToolbarOption {
  slug: string;
  name: string;
}

function FilterSelect({ label, value, onChange, className = "", children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border bg-bg-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-primary ${
        value ? "border-primary" : "border-border"
      } ${className}`}
    >
      {children}
    </select>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs text-text-primary">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remover filtro ${label}`} className="rounded-full p-0.5 text-text-muted hover:bg-primary hover:text-on-accent">
        <IconX size={12} />
      </button>
    </span>
  );
}

/** Cabeçalho do board numa linha só (filete, título, resumo e ações), para as colunas subirem. */
export function BoardHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {/* Filete vermelho ao lado do título, como nos títulos dos gráficos. */}
        <span className="h-0.5 w-5 shrink-0 bg-danger" aria-hidden="true" />
        <h1 className="text-2xl font-normal leading-tight tracking-[-0.03em] text-text-primary">{title}</h1>
        {meta && <span className="text-sm text-text-muted">{meta}</span>}
      </div>
      {actions}
    </div>
  );
}

/**
 * Os filtros menos usados num painel ("Filtros · 2"), para a barra caber numa linha. O que estiver
 * ligado aparece também como chip, então nada fica escondido.
 */
function MoreFilters({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-lg border bg-bg-elevated px-2.5 py-1.5 text-sm text-text-primary transition-colors hover:border-primary ${
          active ? "border-primary" : "border-border"
        }`}
      >
        {active ? `Filtros · ${active}` : "Filtros"}
        <IconChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 flex w-64 flex-col gap-3 rounded-xl border border-border bg-bg-surface p-3 shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

/** Um filtro dentro do painel, com o nome em cima. */
function PanelField({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{name}</span>
      {children}
    </div>
  );
}

/**
 * O topo do board: cabeçalho, busca, filtros e ordenação. O estado vem de fora (da URL); aqui só se
 * mostra e se troca. Filtro ativo aparece sempre como chip removível. Aberto por um link do
 * dashboard, mostra de onde veio e o "Voltar ao dashboard".
 */
export function BoardToolbar({
  title,
  actions,
  filters,
  onChange,
  people,
  me,
  labels,
  shown,
  total,
  peopleCount,
  dragOff,
  origin,
  onBack,
}: {
  title: ReactNode;
  /** Botões à direita do título (ex.: os da demonstração). */
  actions?: ReactNode;
  filters: BoardFilters;
  onChange: (filters: BoardFilters) => void;
  people: ToolbarOption[];
  /** Quem está logado, para o atalho "Eu" no Responsável (o "minhas tarefas" do Trello). */
  me?: ToolbarOption | null;
  labels: ToolbarOption[];
  /** Tarefas que passam nos filtros. */
  shown: number;
  total: number;
  /** Pessoas responsáveis por alguma tarefa do board. */
  peopleCount: number;
  /** Mostra o aviso de que, com filtro ou ordenação, não dá para arrastar. */
  dragOff: boolean;
  /** De onde no dashboard veio o filtro (ex.: "Atenção · Ana tem 2 tarefas atrasadas"). */
  origin?: string | null;
  /** Volta ao dashboard como estava; só existe quando o board veio de um link dele. */
  onBack?: () => void;
}) {
  const set = (changes: Partial<BoardFilters>) => onChange({ ...filters, ...changes });
  const nameOf = (list: ToolbarOption[], slug: string) => list.find((o) => o.slug === slug)?.name ?? slug;
  const filtered = hasFilters(filters);
  const inPanel = [filters.priority, filters.label, filters.due, filters.stalled, filters.column].filter((v) => v != null).length;

  // Atalho "/" leva à busca, como no GitHub e no Gmail. Não vale enquanto se digita em outro campo
  // nem com um painel ou diálogo aberto por cima do board.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="mb-4 flex flex-col gap-3">
      <BoardHeader
        title={title}
        meta={`${filtered ? `${shown} de ${total}` : total} ${total === 1 ? "tarefa" : "tarefas"} · ${peopleCount} ${peopleCount === 1 ? "pessoa" : "pessoas"}`}
        actions={actions}
      />

      {onBack && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-border px-2.5 py-1 text-sm text-text-primary transition-colors hover:border-primary hover:text-primary"
          >
            ← Voltar ao dashboard
          </button>
          {origin && (
            <span className="text-sm text-text-muted">
              Aberto pelo dashboard: <span className="text-text-primary">{origin}</span>
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex w-60 items-center gap-2 rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-text-muted focus-within:border-primary">
          <IconSearch size={14} />
          <input
            ref={searchRef}
            type="search"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Buscar no board…"
            aria-label="Buscar no board"
            aria-keyshortcuts="/"
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          {!filters.q && (
            <kbd title="Atalho: aperte / para buscar" className="rounded border border-border px-1.5 font-sans text-[11px] leading-4 text-text-muted">
              /
            </kbd>
          )}
        </label>
        <FilterSelect label="Responsável" value={filters.assignee ?? ""} onChange={(v) => set({ assignee: v || null })}>
          <option value="">Responsável</option>
          {me && <option value={me.slug}>Eu ({me.name})</option>}
          {people.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <MoreFilters active={inPanel}>
          <PanelField name="Prioridade">
            <FilterSelect label="Prioridade" value={filters.priority ?? ""} onChange={(v) => set({ priority: (v || null) as CardPriority | null })} className="w-full">
              <option value="">Qualquer</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </FilterSelect>
          </PanelField>
          <PanelField name="Etiqueta">
            <FilterSelect label="Etiqueta" value={filters.label ?? ""} onChange={(v) => set({ label: v || null })} className="w-full">
              <option value="">Qualquer</option>
              {labels.map((l) => (
                <option key={l.slug} value={l.slug}>
                  {l.name}
                </option>
              ))}
            </FilterSelect>
          </PanelField>
          <PanelField name="Prazo">
            <FilterSelect label="Prazo" value={filters.due ?? ""} onChange={(v) => set({ due: (v || null) as DueFilter | null })} className="w-full">
              <option value="">Qualquer</option>
              {(Object.keys(DUE_LABEL) as DueFilter[]).map((d) => (
                <option key={d} value={d}>
                  {DUE_OPTION[d]}
                </option>
              ))}
            </FilterSelect>
          </PanelField>
          <PanelField name="Paradas">
            <FilterSelect label="Paradas" value={filters.stalled == null ? "" : String(filters.stalled)} onChange={(v) => set({ stalled: v ? Number(v) : null })} className="w-full">
              <option value="">Qualquer</option>
              {STALLED_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  Paradas +{n} dias
                </option>
              ))}
            </FilterSelect>
          </PanelField>
          <PanelField name="Tipo de coluna">
            <FilterSelect label="Tipo de coluna" value={filters.column ?? ""} onChange={(v) => set({ column: (v || null) as ColumnFilter | null })} className="w-full">
              <option value="">Qualquer</option>
              {(Object.keys(COLUMN_OPTION) as ColumnFilter[]).map((c) => (
                <option key={c} value={c}>
                  {COLUMN_OPTION[c]}
                </option>
              ))}
            </FilterSelect>
          </PanelField>
        </MoreFilters>
        <span className="ml-auto inline-flex items-center gap-2 text-sm text-text-muted">
          Ordenar
          <select
            aria-label="Ordenar"
            value={filters.sort}
            onChange={(e) => set({ sort: e.target.value as BoardSort })}
            className="rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-primary"
          >
            {(Object.keys(SORT_LABEL) as BoardSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </span>
      </div>

      {(filtered || dragOff) && (
        <div className="flex flex-wrap items-center gap-2">
          {origin && filtered && <span className="text-xs text-text-muted">Filtros do dashboard:</span>}
          {filters.q.trim() && <Chip onRemove={() => set({ q: "" })} label={`Busca: “${filters.q.trim()}”`} />}
          {filters.assignee && <Chip onRemove={() => set({ assignee: null })} label={nameOf(people, filters.assignee)} />}
          {filters.priority && <Chip onRemove={() => set({ priority: null })} label={`Prioridade ${PRIORITY_LABEL[filters.priority]}`} />}
          {filters.label && <Chip onRemove={() => set({ label: null })} label={nameOf(labels, filters.label)} />}
          {filters.due && <Chip onRemove={() => set({ due: null })} label={DUE_LABEL[filters.due]} />}
          {filters.stalled != null && <Chip onRemove={() => set({ stalled: null })} label={`Paradas há mais de ${filters.stalled} dias`} />}
          {filters.column && <Chip onRemove={() => set({ column: null })} label={COLUMN_LABEL[filters.column]} />}
          {filtered && (
            <button type="button" onClick={() => onChange({ ...EMPTY_FILTERS, sort: filters.sort })} className="rounded-lg px-2 py-0.5 text-xs text-primary hover:underline">
              Limpar filtros
            </button>
          )}
          {dragOff && <span className="text-xs text-text-muted">Com filtro ou ordenação, arrastar cards fica desligado.</span>}
        </div>
      )}
    </div>
  );
}
