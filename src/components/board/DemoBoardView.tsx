import { useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import type { DashboardData, DashboardTask, ListStatus } from "../../types";
import { LIST_STATUS_LABEL, showsListStatus } from "../../lib/boardVisuals";
import { hasFilters, matchesFilters, personSlugs, slugify, sortCards } from "../../lib/boardFilters";
import { cardRisk } from "../../lib/dashboardRules";
import { DEMO_BOARD_NAME, DEMO_LABELS, demoAttachments, demoBoard, demoFilterable, enteredDayOf, type DemoAttachment } from "../../lib/demoBoard";
import type { DemoFile } from "../../lib/demoFiles";
import { useDemoFiles } from "../../hooks/useDemoFiles";
import { setOpenCard, useBoardFilters, useBoardLink } from "../../hooks/useBoardFilters";
import { useCompact } from "../../hooks/usePreferences";
import { DemoActions, DemoBadge } from "../ui/Demo";
import { BoardToolbar } from "./BoardToolbar";
import { CardFace } from "./CardFace";
import { DemoCardPanel } from "./DemoCardPanel";
import { ListCounter } from "./ListCounter";
import { CollapseButton, CollapsedColumn } from "./CollapsedColumn";
import { useCollapsedLists } from "../../hooks/useCollapsedLists";

const LABEL_OPTIONS = DEMO_LABELS.map((l) => ({ slug: slugify(l.name), name: l.name }));


/**
 * O board da demonstração: as tarefas fictícias do dashboard, hoje, com o mesmo visual e os mesmos
 * filtros do board real. Só leitura: não arrasta nem edita, e nada vai para o banco.
 */
export function DemoBoardView({ data, onRegenerate, onExit, onBackToDashboard }: {
  data: DashboardData;
  onRegenerate: () => void;
  onExit: () => void;
  /** Volta ao dashboard como estava (período e pessoa), quando o board veio de um link dele. */
  onBackToDashboard: () => void;
}) {
  const [filters, setFilters] = useBoardFilters();
  const link = useBoardLink();
  const [isCollapsed, toggleCollapsed] = useCollapsedLists("demo");
  const compact = useCompact();
  const slugs = useMemo(() => personSlugs(data.people), [data.people]);
  const people = useMemo(
    () => [...data.people].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((p) => ({ slug: slugs.get(p.id)!, name: p.name })),
    [data.people, slugs],
  );
  const lists = useMemo(() => demoBoard(data), [data]);
  const attachments = useMemo(() => demoAttachments(data), [data]);
  const files = useDemoFiles(useMemo(() => [...attachments.values()].flat(), [attachments]), data);

  const filterable = (task: DashboardTask, listStatus: ListStatus) => demoFilterable(task, listStatus, slugs, data.today);
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
  // O card aberto vem da URL (?card=), para o dashboard abrir uma tarefa direto. Entregue há mais
  // tempo já saiu da coluna Concluído, mas ainda abre (como concluída).
  const openedTask = link.card ? data.tasks.find((t) => t.id === link.card) : undefined;
  const opened = openedTask && { task: openedTask, listStatus: lists.find((l) => l.tasks.includes(openedTask))?.status ?? ("done" as ListStatus) };
  const filtered = hasFilters(filters);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-4">
      <BoardToolbar
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {DEMO_BOARD_NAME}
            <DemoBadge />
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DemoActions onRegenerate={onRegenerate} onExit={onExit} />
          </div>
        }
        filters={filters}
        onChange={setFilters}
        people={people}
        labels={LABEL_OPTIONS}
        shown={shownLists.reduce((n, l) => n + l.shown.length, 0)}
        total={all.length}
        peopleCount={new Set(all.map((t) => t.assigneeId)).size}
        dragOff={false}
        origin={link.origin}
        onBack={link.origin ? onBackToDashboard : undefined}
      />
      {/* Mesma rolagem do board real: a linha rola na horizontal e cada coluna rola os próprios cards. */}
      <div className="flex min-h-0 flex-1 items-start gap-4 overflow-x-auto overflow-y-hidden">
        {shownLists.map((list) =>
          isCollapsed(list.id) ? (
            <CollapsedColumn key={list.id} name={list.name} count={list.tasks.length} wipLimit={list.wipLimit} onExpand={() => toggleCollapsed(list.id)} />
          ) : (
            <section
              key={list.id}
              aria-label={list.name}
              className={`flex max-h-full w-72 shrink-0 flex-col rounded-2xl border border-border bg-bg-column ${compact ? "gap-1.5 p-2.5" : "gap-2 p-3"}`}
            >
              <div className="flex shrink-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="px-2 py-1 text-base font-semibold">{list.name}</span>
                  {showsListStatus(list.name, list.status) && (
                    <span className="px-2 text-[11px] uppercase tracking-wider text-text-muted">{LIST_STATUS_LABEL[list.status]}</span>
                  )}
                </div>
                {/* O contador é da coluna inteira (é ele que o WIP limita), mesmo com filtro. */}
                <div className="flex shrink-0 items-center gap-1">
                  <ListCounter count={list.tasks.length} wipLimit={list.wipLimit} />
                  <CollapseButton name={list.name} onCollapse={() => toggleCollapsed(list.id)} />
                </div>
              </div>
              <div className={`-mx-1 flex min-h-0 flex-col overflow-y-auto px-1 ${compact ? "gap-1.5" : "gap-2"}`}>
                {list.shown.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-3 text-center text-sm text-text-muted">
                    {filtered && list.tasks.length > 0 ? "Nenhuma tarefa com esses filtros" : "Nenhuma tarefa aqui"}
                  </div>
                ) : (
                  list.shown.map((task) => (
                    <DemoCard
                      key={task.id}
                      task={task}
                      listStatus={list.status}
                      data={data}
                      compact={compact}
                      attachments={attachments.get(task.id) ?? []}
                      files={files}
                      onOpen={() => setOpenCard(task.id)}
                    />
                  ))
                )}
              </div>
            </section>
          ),
        )}
      </div>
      <AnimatePresence>
        {opened && (
          <DemoCardPanel
            task={opened.task}
            person={data.people.find((p) => p.id === opened.task.assigneeId)}
            done={opened.listStatus === "done"}
            attachments={attachments.get(opened.task.id) ?? []}
            files={files}
            onClose={() => setOpenCard(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DemoCard({ task, listStatus, data, compact, attachments, files, onOpen }: {
  task: DashboardTask;
  listStatus: ListStatus;
  data: DashboardData;
  compact: boolean;
  attachments: DemoAttachment[];
  files: Map<string, DemoFile>;
  onOpen: () => void;
}) {
  const person = data.people.find((p) => p.id === task.assigneeId);
  const risk = cardRisk({ dueDay: task.dueDay, listStatus, enteredDay: enteredDayOf(task, data.today) }, data.today);
  return (
    // Como no board real, o card fica num invólucro para não encolher quando a coluna rola.
    <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Abrir ${task.title}`}>
      <CardFace
        title={<span className="flex-1 px-2 py-1">{task.title}</span>}
        priority={task.priority}
        due={task.dueDay}
        done={listStatus === "done"}
        stalledDays={risk.stalledDays}
        assignee={person}
        labels={task.labels.map((name) => DEMO_LABELS.find((l) => l.name === name)!)}
        attachments={attachments.length}
        cover={files.get(attachments.find((a) => a.isCover)?.id ?? "")?.url}
        compact={compact}
      />
    </button>
  );
}
