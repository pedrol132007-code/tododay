import type { ReactNode } from "react";
import type { CardPriority } from "../../types";
import { EMPTY_FILTERS, hasFilters, type BoardFilters, type BoardSort, type ColumnFilter, type DueFilter } from "../../lib/boardFilters";
import { PRIORITIES, PRIORITY_LABEL } from "../../lib/boardVisuals";
import { DUE_SOON_DAYS, STALLED_DAYS } from "../../lib/dashboardRules";
import { IconSearch, IconX } from "../ui/icons";

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

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border bg-bg-elevated px-2 py-1.5 text-sm text-text-primary outline-none focus:border-primary ${
        value ? "border-primary" : "border-border"
      }`}
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

/**
 * Barra abaixo do título do board: resumo, busca, filtros e ordenação. O estado vem de fora (da
 * URL); aqui só se mostra e se troca. Filtro ativo aparece sempre como chip removível.
 */
export function BoardToolbar({
  filters,
  onChange,
  people,
  labels,
  shown,
  total,
  peopleCount,
  dragOff,
}: {
  filters: BoardFilters;
  onChange: (filters: BoardFilters) => void;
  people: ToolbarOption[];
  labels: ToolbarOption[];
  /** Tarefas que passam nos filtros. */
  shown: number;
  total: number;
  /** Pessoas responsáveis por alguma tarefa do board. */
  peopleCount: number;
  /** Mostra o aviso de que, com filtro ou ordenação, não dá para arrastar. */
  dragOff: boolean;
}) {
  const set = (changes: Partial<BoardFilters>) => onChange({ ...filters, ...changes });
  const nameOf = (list: ToolbarOption[], slug: string) => list.find((o) => o.slug === slug)?.name ?? slug;
  const filtered = hasFilters(filters);

  return (
    <div className="-mt-2 mb-4 flex flex-col gap-3">
      <p className="text-sm text-text-muted">
        {filtered ? `${shown} de ${total}` : total} {total === 1 ? "tarefa" : "tarefas"} · {peopleCount} {peopleCount === 1 ? "pessoa" : "pessoas"}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex w-60 items-center gap-2 rounded-lg border border-border bg-bg-elevated px-2 py-1.5 text-text-muted focus-within:border-primary">
          <IconSearch size={14} />
          <input
            type="search"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Buscar no board…"
            aria-label="Buscar no board"
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
        </label>
        <FilterSelect label="Responsável" value={filters.assignee ?? ""} onChange={(v) => set({ assignee: v || null })}>
          <option value="">Responsável</option>
          {people.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Prioridade" value={filters.priority ?? ""} onChange={(v) => set({ priority: (v || null) as CardPriority | null })}>
          <option value="">Prioridade</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Etiqueta" value={filters.label ?? ""} onChange={(v) => set({ label: v || null })}>
          <option value="">Etiqueta</option>
          {labels.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Prazo" value={filters.due ?? ""} onChange={(v) => set({ due: (v || null) as DueFilter | null })}>
          <option value="">Prazo</option>
          {(Object.keys(DUE_LABEL) as DueFilter[]).map((d) => (
            <option key={d} value={d}>
              {DUE_OPTION[d]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Paradas" value={filters.stalled == null ? "" : String(filters.stalled)} onChange={(v) => set({ stalled: v ? Number(v) : null })}>
          <option value="">Paradas</option>
          {STALLED_OPTIONS.map((n) => (
            <option key={n} value={n}>
              Paradas +{n} dias
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Tipo de coluna" value={filters.column ?? ""} onChange={(v) => set({ column: (v || null) as ColumnFilter | null })}>
          <option value="">Coluna</option>
          {(Object.keys(COLUMN_OPTION) as ColumnFilter[]).map((c) => (
            <option key={c} value={c}>
              {COLUMN_OPTION[c]}
            </option>
          ))}
        </FilterSelect>
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
