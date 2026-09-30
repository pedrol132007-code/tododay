import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { DashboardData, DashboardTask } from "../../types";
import { formatDue } from "../../lib/boardVisuals";
import { EMPTY_FILTERS, personSlugs, type BoardFilters } from "../../lib/boardFilters";
import { alertFilters, linkFilters, type BoardLinkTarget } from "../../lib/dashboardLinks";
import { useDashboardView } from "../../hooks/useBoardFilters";
import { alertTasks, attentionAlerts, isInProgress, isOverdue, STALLED_DAYS, stalledDays, stalledList } from "../../lib/dashboardRules";
import { teamLoad, type PersonLoad } from "../../lib/teamLoad";
import {
  deliveredIn,
  deliveredLateIn,
  openAt,
  periodMetrics,
  previousRange,
  rangeLength,
  seriesByBucket,
  teamAverageSeries,
  type PeriodMetrics,
} from "../../lib/metrics";
import { backlogSummary, deliveriesSummary, flowSummary, loadSummary } from "../../lib/chartSummaries";
import { variation } from "../../lib/variation";
import { Avatar } from "../ui/Avatar";
import { DemoActions, DemoBadge } from "../ui/Demo";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";
import { IconColumns } from "../ui/icons";
import { ChartFrame } from "./charts/ChartFrame";
import { ColumnChart } from "./charts/ColumnChart";
import { LineChart } from "./charts/LineChart";
import { StatTile } from "./charts/StatTile";
import { dayNum, days, num, pct } from "./format";
import { AttentionCard } from "./AttentionCard";
import { PeriodPicker, selectionLabel, selectionRange, type PeriodSelection } from "./PeriodPicker";
import { TaskListPanel } from "./TaskListPanel";
import { StalledSection } from "./StalledSection";
import { TeamLoadTable, type LoadList } from "./TeamLoadTable";
import { Variation } from "./Variation";

const LOAD_LABEL: Record<LoadList, string> = { inProgress: "Em andamento", overdue: "Atrasadas", stalled: "Paradas", delivered: "Entregas" };

/**
 * `data` vem de fora: a demonstração é a mesma no board e no dashboard. `onOpenBoard` abre o board
 * filtrado (ou com um card aberto). Período e pessoa ficam na URL, para o "Voltar ao dashboard".
 */
export function DashboardView({ teamName, data, onGenerate, onExit, onOpenBoard }: {
  teamName: string;
  data: DashboardData | null;
  onGenerate: () => void;
  onExit: () => void;
  onOpenBoard: (link: BoardLinkTarget) => void;
}) {
  const [state, setState] = useDashboardView();
  const slugs = useMemo(() => personSlugs(data?.people ?? []), [data]);
  const period = state.period;
  const personId = data?.people.find((p) => slugs.get(p.id) === state.person)?.id ?? null;
  const setPeriod = (next: PeriodSelection) => setState({ ...state, period: next });
  const setPersonId = (id: string | null) => setState({ ...state, person: id ? (slugs.get(id) ?? null) : null });

  function exitDemo() {
    onExit();
    setPersonId(null);
  }

  const person = data?.people.find((p) => p.id === personId) ?? null;

  return (
    <div className="relative flex h-full flex-col overflow-y-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow={person ? teamName : "Dashboard"}
          onBack={person ? () => setPersonId(null) : undefined}
          title={
            <span className="inline-flex flex-wrap items-center gap-3">
              {person ? `Dashboard · ${person.name}` : teamName}
              {data?.isDemo && <DemoBadge />}
            </span>
          }
        />
        {data && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <PeriodPicker value={period} onChange={setPeriod} today={data.today} min={data.since} />
            <DemoActions onRegenerate={onGenerate} onExit={exitDemo} />
          </div>
        )}
      </div>

      {data ? (
        <DashboardBody data={data} period={period} personId={personId} onSelectPerson={setPersonId} onOpenBoard={onOpenBoard} />
      ) : (
        <div className="flex flex-1 items-start justify-center">
          <EmptyState
            icon={<IconColumns size={22} />}
            title="O dashboard ainda não tem dados"
            description="As métricas reais chegam com o status do card. Enquanto isso, veja como fica com dados de exemplo."
            action={
              <button type="button" onClick={onGenerate} className="btn-primary px-4 py-2">
                Gerar demonstração
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

function DashboardBody({ data, period, personId, onSelectPerson, onOpenBoard }: {
  data: DashboardData;
  period: PeriodSelection;
  personId: string | null;
  onSelectPerson: (id: string | null) => void;
  onOpenBoard: (link: BoardLinkTarget) => void;
}) {
  const person = data.people.find((p) => p.id === personId) ?? null;
  const [list, setList] = useState<{ title: string; tasks: DashboardTask[] } | null>(null);

  const view = useMemo(() => {
    const range = selectionRange(period, data.today);
    const prevRange = previousRange(range);
    const tasks = person ? data.tasks.filter((t) => t.assigneeId === person.id) : data.tasks;
    const series = seriesByBucket(tasks, range);
    const sum = periodMetrics(tasks, range);
    // Sem dados completos para o período anterior inteiro, não há com o que comparar.
    const prev: PeriodMetrics | null = prevRange.start >= data.since ? periodMetrics(tasks, prevRange) : null;
    const team = person ? teamAverageSeries(data.tasks, range, data.people.length) : null;
    // Atenção, carga e paradas olham o último dia do período; na visão de uma pessoa, só ela.
    const alerts = attentionAlerts(person ? [person] : data.people, tasks, range.end, { perFact: person != null });
    const stalled = person ? stalledList(tasks, range.end) : [];
    return { range, tasks, series, sum, prev, team, alerts, stalled, load: teamLoad(data.people, data.tasks, range) };
  }, [data, period, person]);

  const todayDate = new Date(`${data.today}T12:00:00`);
  const labels = view.series.map((p) => formatDue(p.range.start, todayDate));
  const byDay = rangeLength(view.range) <= 31;
  const per = byDay ? "por dia" : "por semana";
  const periodName = selectionLabel(period, data.today).toLowerCase();
  const subject = person ? person.name.split(" ")[0] : "Equipe";
  const refName = "Média da equipe";
  const { sum, prev } = view;
  const deliveredTrend = variation("delivered", sum.delivered, prev?.delivered ?? null);
  const refLegend = view.team ? [{ label: subject, color: "chart-1" as const }, { label: refName, color: "chart-ref" as const, dashed: true }] : undefined;
  const of = person ? ` de ${subject}` : "";
  // Os pontos dos resumos são os mesmos do gráfico: nunca falam de outro período.
  const grain = byDay ? "day" : "week";
  const points = view.series.map((p, i) => ({ ...p, label: labels[i] }));

  // O board mostra hoje: só dá para abrir nele o que o período olha no dia de hoje. Num período
  // que termina antes, a lista continua aqui mesmo.
  const toBoard = view.range.end === data.today;
  const slugs = personSlugs(data.people);
  const personSlug = person ? slugs.get(person.id)! : null;
  const openFiltered = (filters: BoardFilters, origin: string) => onOpenBoard({ filters, origin, card: null });
  /** Uma tarefa abre direto no board (o card como está hoje), de qualquer período. */
  const openTask = (task: DashboardTask, origin: string) => onOpenBoard({ filters: EMPTY_FILTERS, origin, card: task.id });

  function openLoadList(row: PersonLoad, kind: LoadList) {
    const first = row.person.name.split(" ")[0];
    const own = data.tasks.filter((t) => t.assigneeId === row.person.id);
    // Entregas são do período inteiro (já saíram do board): sempre a lista aqui.
    if (toBoard && kind !== "delivered") return openFiltered(linkFilters(kind, slugs.get(row.person.id)!), `Carga da equipe · ${first} · ${LOAD_LABEL[kind]}`);
    const day = view.range.end;
    const lists: Record<LoadList, { title: string; tasks: DashboardTask[] }> = {
      delivered: { title: `${first}: ${row.delivered} ${row.delivered === 1 ? "entrega" : "entregas"} · ${periodName}`, tasks: deliveredIn(own, view.range) },
      inProgress: { title: `${first}: ${row.inProgress} em andamento`, tasks: own.filter((t) => isInProgress(t, day)) },
      overdue: { title: `${first}: ${row.overdue} ${row.overdue === 1 ? "atrasada" : "atrasadas"}`, tasks: own.filter((t) => isOverdue(t, day)) },
      stalled: {
        title: `${first}: ${row.stalled} ${row.stalled === 1 ? "parada" : "paradas"} há mais de ${STALLED_DAYS} dias`,
        tasks: own.filter((t) => stalledDays(t, day) != null),
      },
    };
    setList(lists[kind]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label="Visão" className="flex flex-wrap gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={personId == null}
          onClick={() => onSelectPerson(null)}
          className={`rounded-full border px-3 py-1 text-sm ${personId == null ? "border-primary bg-primary text-on-accent" : "border-border text-text-primary hover:bg-bg-elevated"}`}
        >
          Equipe
        </button>
        {data.people.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={personId === p.id}
            onClick={() => onSelectPerson(p.id)}
            className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm ${personId === p.id ? "border-primary bg-primary/10 text-text-primary" : "border-border text-text-primary hover:bg-bg-elevated"}`}
          >
            <Avatar userId={p.id} name={p.name} />
            {p.name}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Entregas"
          value={num(sum.delivered)}
          delta={<Variation metric="delivered" current={sum.delivered} previous={prev?.delivered ?? null} />}
          spark={view.series.map((p) => p.delivered)}
          onOpen={() => setList({ title: `Entregas${of} · ${periodName}`, tasks: deliveredIn(view.tasks, view.range) })}
        />
        <StatTile
          label="Backlog"
          value={num(sum.openAtEnd)}
          note="tarefas abertas no fim do período"
          openLabel={toBoard ? "Ver no board" : "Ver tarefas"}
          // No início do período havia o que há no fim menos o que entrou e mais o que saiu.
          delta={<Variation metric="backlog" current={sum.openAtEnd} previous={sum.openAtEnd - sum.backlogChange} />}
          spark={view.series.map((p) => p.openAtEnd)}
          onOpen={() =>
            toBoard
              ? openFiltered(linkFilters("open", personSlug), person ? `Backlog de ${subject}` : "Backlog da equipe")
              : setList({ title: `Abertas${of} no fim do período`, tasks: openAt(view.tasks, view.range.end) })
          }
        />
        <StatTile
          label="Tempo de conclusão"
          value={dayNum(sum.cycleP85)}
          unit={sum.cycleP85 == null ? undefined : "dias"}
          note={
            sum.cycleP85 == null ? undefined : (
              <>
                85% das tarefas fecham em até {days(sum.cycleP85)}
                <span className="block text-xs text-text-muted">Mediana: {days(sum.cycleMedian)}</span>
              </>
            )
          }
          delta={<Variation metric="cycleTime" current={sum.cycleP85} previous={prev?.cycleP85 ?? null} />}
          spark={view.series.map((p) => p.cycleP85)}
        />
        <StatTile
          label="No prazo"
          value={pct(sum.onTimeRate)}
          meter={sum.onTimeRate}
          note={sum.onTimeRate == null ? undefined : `${num(sum.withDue)} entregas com prazo no período`}
          delta={<Variation metric="onTime" current={sum.onTimeRate} previous={prev?.onTimeRate ?? null} />}
          spark={view.series.map((p) => p.onTimeRate)}
          onOpen={() => setList({ title: `Entregues fora do prazo${of} · ${periodName}`, tasks: deliveredLateIn(view.tasks, view.range) })}
        />
      </div>

      <AttentionCard
        alerts={view.alerts}
        tasksOf={(alert) => alertTasks(view.tasks, alert, view.range.end)}
        onOpenTask={(task, alert) => openTask(task, `Atenção · ${alert.text}`)}
        onOpen={(alert) =>
          toBoard
            ? openFiltered(alertFilters(alert, slugs), `Atenção · ${alert.text}`)
            : setList({ title: alert.text, tasks: alertTasks(view.tasks, alert, view.range.end) })
        }
        openLabel={toBoard ? "Ver no board" : "Ver tarefas"}
        onOpenPerson={onSelectPerson}
      />

      {person ? (
        <StalledSection
          items={view.stalled}
          day={view.range.end}
          onOpenTask={(task) => openTask(task, `Parado há mais de ${STALLED_DAYS} dias · ${subject}`)}
          onOpenAll={() =>
            setList({ title: `${subject}: paradas há mais de ${STALLED_DAYS} dias`, tasks: view.stalled.map((x) => x.task) })
          }
        />
      ) : (
        <ChartFrame title="Carga da equipe">
          <TeamLoadTable rows={view.load} onSelect={onSelectPerson} onOpenList={openLoadList} />
        </ChartFrame>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
          title={`Entregas ${per}`}
          legend={refLegend}
          summary={deliveriesSummary(points, grain)}
          table={{
            columns: view.team ? ["Início", subject, refName] : ["Início", "Entregas"],
            rows: view.series.map((p, i) => (view.team ? [labels[i], p.delivered, num(view.team[i].delivered, 1)] : [labels[i], p.delivered])),
          }}
        >
          <ColumnChart
            labels={labels}
            values={view.series.map((p) => p.delivered)}
            name={subject}
            format={(v) => num(v, 1)}
            reference={view.team?.map((p) => p.delivered)}
            referenceName={refName}
            ariaLabel={`Entregas ${per} de ${subject}, ${periodName}: total ${num(sum.delivered)}${deliveredTrend ? `. ${deliveredTrend.tooltip}` : ""}`}
          />
        </ChartFrame>

        <ChartFrame
          title="Criados x concluídos"
          summary={flowSummary(points, grain)}
          legend={[{ label: "Concluídos", color: "chart-1" }, { label: "Criados", color: "chart-2" }]}
          table={{ columns: ["Início", "Criados", "Concluídos"], rows: view.series.map((p, i) => [labels[i], p.created, p.delivered]) }}
        >
          <LineChart
            labels={labels}
            series={[
              { name: "Concluídos", values: view.series.map((p) => p.delivered), color: "chart-1" },
              { name: "Criados", values: view.series.map((p) => p.created), color: "chart-2" },
            ]}
            format={(v) => num(v, 1)}
            ariaLabel={`Criados e concluídos ${per}: ${num(sum.created)} criados, ${num(sum.delivered)} concluídos`}
          />
        </ChartFrame>
      </div>

      <div className={`grid gap-4 ${person ? "xl:grid-cols-2" : ""}`}>
        <ChartFrame
          title="Backlog ao longo do tempo (tarefas abertas)"
          legend={refLegend}
          summary={backlogSummary(sum.backlogChange)}
          table={{
            columns: view.team ? ["Fim", subject, refName] : ["Fim", "Abertas"],
            rows: view.series.map((p, i) => {
              const end = formatDue(p.range.end, todayDate);
              return view.team ? [end, p.openAtEnd, num(view.team[i].openAtEnd, 1)] : [end, p.openAtEnd];
            }),
          }}
        >
          <LineChart
            labels={view.series.map((p) => formatDue(p.range.end, todayDate))}
            series={[
              { name: subject, values: view.series.map((p) => p.openAtEnd), color: "chart-1" },
              ...(view.team ? [{ name: refName, values: view.team.map((p) => p.openAtEnd), color: "chart-ref" as const, dashed: true }] : []),
            ]}
            format={(v) => num(v, 1)}
            ariaLabel={`Tarefas abertas de ${subject} no fim de cada ${byDay ? "dia" : "semana"}: ${num(sum.openAtEnd)} no fim do período`}
          />
        </ChartFrame>

        {person && (
          <ChartFrame
            title="Carga ao longo do tempo"
            summary={loadSummary(points)}
            legend={[{ label: "Entregues", color: "chart-1" }, { label: "Em andamento", color: "chart-2" }]}
            table={{ columns: ["Início", "Entregues", "Em andamento"], rows: view.series.map((p, i) => [labels[i], p.delivered, p.inProgressAtEnd]) }}
          >
            <LineChart
              labels={labels}
              series={[
                { name: "Entregues", values: view.series.map((p) => p.delivered), color: "chart-1" },
                { name: "Em andamento", values: view.series.map((p) => p.inProgressAtEnd), color: "chart-2" },
              ]}
              format={(v) => num(v, 1)}
              ariaLabel={`Carga de ${subject} ${per}`}
            />
          </ChartFrame>
        )}
      </div>

      <AnimatePresence>
        {list && (
          <TaskListPanel
            title={list.title}
            tasks={list.tasks}
            people={data.people}
            day={view.range.end}
            isDemo={data.isDemo}
            onOpenTask={(task) => openTask(task, list.title)}
            onClose={() => setList(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
