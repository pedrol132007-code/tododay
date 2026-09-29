import { useMemo } from "react";
import type { DashboardData, DashboardTask, ListStatus } from "../../types";
import { LIST_STATUS_LABEL } from "../../lib/boardVisuals";
import { hasFilters, matchesFilters, personSlugs, slugify, sortCards, type FilterableCard } from "../../lib/boardFilters";
import { cardRisk } from "../../lib/dashboardRules";
import { DEMO_BOARD_NAME, DEMO_LABELS, demoBoard } from "../../lib/demoBoard";
import { useBoardFilters } from "../../hooks/useBoardFilters";
import { useCompact } from "../../hooks/usePreferences";
import { DemoActions, DemoBadge } from "../ui/Demo";
import { PageHeader } from "../ui/PageHeader";
import { BoardToolbar } from "./BoardToolbar";
import { CardFace } from "./CardFace";
import { ListCounter } from "./ListCounter";

const LABEL_OPTIONS = DEMO_LABELS.map((l) => ({ slug: slugify(l.name), name: l.name }));

/** Entrou na coluna na última mudança de status: é o mesmo "parada há X dias" do dashboard. */
const enteredDayOf = (task: DashboardTask, today: string) => [...task.history].reverse().find((h) => h.day <= today)!.day;

/**
 * O board da demonstração: as tarefas fictícias do dashboard, hoje, com o mesmo visual e os mesmos
 * filtros do board real. Só leitura: não arrasta nem edita, e nada vai para o banco.
 */
export function DemoBoardView({ data, onRegenerate, onExit }: { data: DashboardData; onRegenerate: () => void; onExit: () => void }) {
  const [filters, setFilters] = useBoardFilters();
  const compact = useCompact();
  const slugs = useMemo(() => personSlugs(data.people), [data.people]);
  const people = useMemo(
    () => [...data.people].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((p) => ({ slug: slugs.get(p.id)!, name: p.name })),
    [data.people, slugs],
  );
  const lists = useMemo(() => demoBoard(data), [data]);

  const filterable = (task: DashboardTask, listStatus: ListStatus): FilterableCard => ({
    title: task.title,
    assigneeSlug: slugs.get(task.assigneeId) ?? null,
    priority: task.priority,
    labelSlugs: task.labels.map(slugify),
    dueDay: task.dueDay,
    listStatus,
    enteredDay: enteredDayOf(task, data.today),
  });
  const shownLists = lists.map((list) => ({
    ...list,
    shown: sortCards(
      list.tasks.filter((t) => matchesFilters(filterable(t, list.status), filters, data.today)),
      filters.sort,
      (t) => filterable(t, list.status),
      data.today,
    ),
  }));
  const all = lists.flatMap((l) => l.tasks);
  const filtered = hasFilters(filters);

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-3">
              {DEMO_BOARD_NAME}
              <DemoBadge />
            </span>
          }
        />
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <DemoActions onRegenerate={onRegenerate} onExit={onExit} />
        </div>
      </div>
      <BoardToolbar
        filters={filters}
        onChange={setFilters}
        people={people}
        labels={LABEL_OPTIONS}
        shown={shownLists.reduce((n, l) => n + l.shown.length, 0)}
        total={all.length}
        peopleCount={new Set(all.map((t) => t.assigneeId)).size}
        dragOff={false}
      />
      {/* Mesma rolagem do board real: a linha rola na horizontal e cada coluna rola os próprios cards. */}
      <div className="flex min-h-0 flex-1 items-start gap-4 overflow-x-auto overflow-y-hidden">
        {shownLists.map((list) => (
          <section
            key={list.id}
            aria-label={list.name}
            className={`flex max-h-full w-72 shrink-0 flex-col rounded-2xl border border-border bg-bg-column ${compact ? "gap-2 p-3" : "gap-3 p-4"}`}
          >
            <div className="flex shrink-0 items-center justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="px-2 py-1 text-lg font-semibold">{list.name}</span>
                <span className="px-2 text-[11px] uppercase tracking-wider text-text-muted">{LIST_STATUS_LABEL[list.status]}</span>
              </div>
              {/* O contador é da coluna inteira (é ele que o WIP limita), mesmo com filtro. */}
              <ListCounter count={list.tasks.length} wipLimit={list.wipLimit} />
            </div>
            <div className={`-mx-1 flex min-h-0 flex-col overflow-y-auto px-1 ${compact ? "gap-1.5" : "gap-2"}`}>
              {list.shown.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-3 text-center text-sm text-text-muted">
                  {filtered && list.tasks.length > 0 ? "Nenhuma tarefa com esses filtros" : "Nenhuma tarefa aqui"}
                </div>
              ) : (
                list.shown.map((task) => <DemoCard key={task.id} task={task} listStatus={list.status} data={data} compact={compact} />)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function DemoCard({ task, listStatus, data, compact }: { task: DashboardTask; listStatus: ListStatus; data: DashboardData; compact: boolean }) {
  const person = data.people.find((p) => p.id === task.assigneeId);
  const risk = cardRisk({ dueDay: task.dueDay, listStatus, enteredDay: enteredDayOf(task, data.today) }, data.today);
  return (
    // Como no board real, o card fica num invólucro para não encolher quando a coluna rola.
    <div>
      <CardFace
        title={<span className="flex-1 px-2 py-1">{task.title}</span>}
        priority={task.priority}
        due={task.dueDay}
        done={listStatus === "done"}
        stalledDays={risk.stalledDays}
        assignee={person}
        labels={task.labels.map((name) => DEMO_LABELS.find((l) => l.name === name)!)}
        compact={compact}
      />
    </div>
  );
}
