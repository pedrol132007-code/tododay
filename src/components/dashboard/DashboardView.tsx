import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { DashboardData, DashboardTask } from "../../types";
import { formatDue } from "../../lib/boardVisuals";
import { alertTasks, attentionAlerts, isInProgress, isOverdue, STALLED_DAYS, stalledDays, stalledList } from "../../lib/dashboardRules";
import { generateDemo } from "../../lib/demoData";
import { teamLoad, type PersonLoad } from "../../lib/teamLoad";
import {
  compare,
  deliveredIn,
  deliveredLateIn,
  openAt,
  periodMetrics,
  previousRange,
  rangeLength,
  seriesByBucket,
  teamAverageSeries,
  tone,
  type PeriodMetrics,
} from "../../lib/metrics";
import { Avatar } from "../ui/Avatar";
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

const VS = "vs. período anterior";

/** `words` diz o que a seta significa quando "subir" não é óbvio (ex.: tempo maior = mais lento). */
function relative(cur: number | null, prev: number | null, words?: { up: string; down: string }): string | null {
  const c = compare(cur, prev);
  if (c == null) return null;
  const dir = c > 0.005 ? "up" : c < -0.005 ? "down" : null;
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "■";
  const meaning = dir && words ? ` ${words[dir]}` : "";
  return `${arrow} ${num(Math.abs(c * 100))}%${meaning} ${VS}`;
}

/** Variação em palavras para leitores de tela: "alta de 18%", "queda de 5%", "estável". */
function trendWords(cur: number | null, prev: number | null): string | null {
  const c = compare(cur, prev);
  if (c == null) return null;
  if (Math.abs(c) <= 0.005) return "estável";
  return `${c > 0 ? "alta" : "queda"} de ${num(Math.abs(c * 100))}%`;
}

/** Diferença de taxas em pontos percentuais: "+2 p.p. vs. período anterior". */
function points(cur: number | null, prev: number | null): string | null {
  if (cur == null || prev == null) return null;
  const d = Math.round((cur - prev) * 100);
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${num(Math.abs(d))} p.p. ${VS}`;
}

function backlogText(change: number): string {
  if (change > 0) return `entraram ${num(change)} a mais do que saíram`;
  if (change < 0) return `saíram ${num(-change)} a mais do que entraram`;
  return "entrou o mesmo tanto que saiu";
}

export function DashboardView({ teamName }: { teamName: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<PeriodSelection>({ kind: "preset", preset: "12w" });
  const [personId, setPersonId] = useState<string | null>(null);

  function generate() {
    setData(generateDemo(Math.floor(Math.random() * 2 ** 31)));
  }

  function exitDemo() {
    setData(null);
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
              {data?.isDemo && (
                <span className="rounded-lg bg-highlight px-2 py-1 text-xs font-semibold uppercase tracking-wider text-black">Demonstração</span>
              )}
            </span>
          }
        />
        {data && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <PeriodPicker value={period} onChange={setPeriod} today={data.today} min={data.since} />
            <button type="button" onClick={generate} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-bg-elevated">
              Gerar de novo
            </button>
            <button type="button" onClick={exitDemo} className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary">
              Sair da demonstração
            </button>
          </div>
        )}
      </div>

      {data ? (
        <DashboardBody data={data} period={period} personId={personId} onSelectPerson={setPersonId} />
      ) : (
        <div className="flex flex-1 items-start justify-center">
          <EmptyState
            icon={<IconColumns size={22} />}
            title="O dashboard ainda não tem dados"
            description="As métricas reais chegam com o status do card. Enquanto isso, veja como fica com dados de exemplo."
            action={
              <button type="button" onClick={generate} className="btn-primary px-4 py-2">
                Gerar demonstração
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

function DashboardBody({ data, period, personId, onSelectPerson }: {
  data: DashboardData;
  period: PeriodSelection;
  personId: string | null;
  onSelectPerson: (id: string | null) => void;
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
    const alerts = attentionAlerts(person ? [person] : data.people, tasks, range.end);
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
  const deliveredTrend = trendWords(sum.delivered, prev?.delivered ?? null);
  const refLegend = view.team ? [{ label: subject, color: "chart-1" as const }, { label: refName, color: "chart-ref" as const, dashed: true }] : undefined;
  const of = person ? ` de ${subject}` : "";

  function openLoadList(row: PersonLoad, kind: LoadList) {
    const first = row.person.name.split(" ")[0];
    const own = data.tasks.filter((t) => t.assigneeId === row.person.id);
    const day = view.range.end;
    const lists: Record<LoadList, { title: string; tasks: DashboardTask[] }> = {
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
          delta={relative(sum.delivered, prev?.delivered ?? null)}
          tone={tone(sum.delivered, prev?.delivered ?? null, "up")}
          spark={view.series.map((p) => p.delivered)}
          onOpen={() => setList({ title: `Entregas${of} · ${periodName}`, tasks: deliveredIn(view.tasks, view.range) })}
        />
        <StatTile
          label="Backlog"
          value={`${sum.backlogChange > 0 ? "+" : sum.backlogChange < 0 ? "−" : ""}${num(Math.abs(sum.backlogChange))}`}
          delta={backlogText(sum.backlogChange)}
          tone={sum.backlogChange > 0 ? "bad" : sum.backlogChange < 0 ? "good" : "neutral"}
          spark={view.series.map((p) => p.openAtEnd)}
          onOpen={() => setList({ title: `Abertas${of} no fim do período`, tasks: openAt(view.tasks, view.range.end) })}
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
          delta={relative(sum.cycleP85, prev?.cycleP85 ?? null, { up: "mais lento", down: "mais rápido" })}
          tone={tone(sum.cycleP85, prev?.cycleP85 ?? null, "down")}
          spark={view.series.map((p) => p.cycleP85)}
        />
        <StatTile
          label="No prazo"
          value={pct(sum.onTimeRate)}
          meter={sum.onTimeRate}
          note={sum.onTimeRate == null ? undefined : `${num(sum.withDue)} entregas com prazo no período`}
          delta={points(sum.onTimeRate, prev?.onTimeRate ?? null)}
          tone={tone(sum.onTimeRate, prev?.onTimeRate ?? null, "up")}
          spark={view.series.map((p) => p.onTimeRate)}
          onOpen={() => setList({ title: `Entregues fora do prazo${of} · ${periodName}`, tasks: deliveredLateIn(view.tasks, view.range) })}
        />
      </div>

      <AttentionCard
        alerts={view.alerts}
        onOpen={(alert) => setList({ title: alert.text, tasks: alertTasks(view.tasks, alert, view.range.end) })}
      />

      {person ? (
        <StalledSection
          items={view.stalled}
          day={view.range.end}
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
            ariaLabel={`Entregas ${per} de ${subject}, ${periodName}: total ${num(sum.delivered)}${deliveredTrend ? `, ${deliveredTrend} ${VS}` : ""}`}
          />
        </ChartFrame>

        <ChartFrame
          title="Criados x concluídos"
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
            onClose={() => setList(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
