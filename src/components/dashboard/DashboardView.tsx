import { useMemo, useState, type ReactNode } from "react";
import type { DashboardData } from "../../types";
import { compare, perPerson, periodWeeks, summary, teamAverageSeries, weeklySeries } from "../../lib/dashboard";
import { generateDemoData } from "../../lib/demoData";
import { formatDue } from "../../lib/boardVisuals";
import { Avatar } from "../ui/Avatar";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";
import { IconColumns } from "../ui/icons";
import { ChartFrame } from "./charts/ChartFrame";
import { ColumnChart } from "./charts/ColumnChart";
import { HBarChart } from "./charts/HBarChart";
import { LineChart } from "./charts/LineChart";
import { StatTile } from "./charts/StatTile";

const PERIODS = [4, 12, 26] as const;
type Period = (typeof PERIODS)[number];

const num = (v: number, digits = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const days = (v: number | null) => (v == null ? "—" : `${num(v, 1)} d`);
const pct = (v: number | null) => (v == null ? "—" : `${num(v * 100)}%`);

function relative(cur: number | null, prev: number | null, period: Period): string | null {
  const c = compare(cur, prev);
  if (c == null) return null;
  const arrow = c > 0.005 ? "▲" : c < -0.005 ? "▼" : "■";
  return `${arrow} ${num(Math.abs(c * 100))}% vs. ${period} semanas anteriores`;
}

function points(cur: number | null, prev: number | null, period: Period): string | null {
  if (cur == null || prev == null) return null;
  const d = (cur - prev) * 100;
  const arrow = d > 0.5 ? "▲" : d < -0.5 ? "▼" : "■";
  return `${arrow} ${num(Math.abs(d))} pts vs. ${period} semanas anteriores`;
}

function Segmented<T extends string | number>({ label, options, value, onChange, format }: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => ReactNode;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit rounded-xl border border-border bg-bg-elevated p-0.5">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={o === value}
          onClick={() => onChange(o)}
          className={`rounded-lg px-3 py-1 text-sm transition-colors ${o === value ? "bg-primary text-on-accent" : "text-text-muted hover:text-text-primary"}`}
        >
          {format(o)}
        </button>
      ))}
    </div>
  );
}

export function DashboardView({ teamName }: { teamName: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState<Period>(12);
  const [personId, setPersonId] = useState<string | null>(null);

  function generate() {
    setData(generateDemoData(Math.floor(Math.random() * 2 ** 31)));
  }

  function exitDemo() {
    setData(null);
    setPersonId(null);
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Dashboard"
          title={
            <span className="inline-flex flex-wrap items-center gap-3">
              {teamName}
              {data?.isDemo && (
                <span className="rounded-lg bg-highlight px-2 py-1 text-xs font-semibold uppercase tracking-wider text-black">Demonstração</span>
              )}
            </span>
          }
        />
        {data && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Segmented label="Período" options={PERIODS} value={period} onChange={setPeriod} format={(p) => `${p} sem.`} />
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
  period: Period;
  personId: string | null;
  onSelectPerson: (id: string | null) => void;
}) {
  const today = new Date();
  const person = data.people.find((p) => p.id === personId) ?? null;

  const view = useMemo(() => {
    const weeks = periodWeeks(data, period);
    const prevWeeks = periodWeeks(data, period, 1);
    const series = weeklySeries(data, weeks, personId ?? undefined);
    const sum = summary(series);
    const prev = summary(weeklySeries(data, prevWeeks, personId ?? undefined));
    const team = personId ? teamAverageSeries(data, weeks) : null;
    return { weeks, series, sum, prev, team, people: perPerson(data, weeks) };
  }, [data, period, personId]);

  const labels = view.weeks.map((w) => formatDue(w, today));
  const subject = person ? person.name.split(" ")[0] : "Equipe";
  const refName = "Média da equipe";

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
          value={num(view.sum.delivered)}
          delta={relative(view.sum.delivered, view.prev.delivered, period)}
          spark={view.series.map((p) => p.delivered)}
        />
        <StatTile
          label="Criados − concluídos"
          value={`${view.sum.balance > 0 ? "+" : ""}${num(view.sum.balance)}`}
          delta={view.sum.balance > 0 ? "Entrou mais trabalho do que saiu" : view.sum.balance < 0 ? "Saiu mais trabalho do que entrou" : "Equilibrado"}
        />
        <StatTile
          label="Tempo médio"
          value={days(view.sum.avgCycleDays)}
          delta={relative(view.sum.avgCycleDays, view.prev.avgCycleDays, period)}
        />
        <StatTile label="No prazo" value={pct(view.sum.onTimeRate)} delta={points(view.sum.onTimeRate, view.prev.onTimeRate, period)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Entregas por semana"
          legend={view.team ? [{ label: subject, color: "chart-1" }, { label: refName, color: "chart-ref", dashed: true }] : undefined}
          table={{
            columns: view.team ? ["Semana", subject, refName] : ["Semana", "Entregas"],
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
            ariaLabel={`Entregas por semana de ${subject}: ${period} semanas, total ${num(view.sum.delivered)}`}
          />
        </ChartFrame>

        <ChartFrame
          title="Criados x concluídos"
          legend={[{ label: "Concluídos", color: "chart-1" }, { label: "Criados", color: "chart-2" }]}
          table={{ columns: ["Semana", "Criados", "Concluídos"], rows: view.series.map((p, i) => [labels[i], p.created, p.delivered]) }}
        >
          <LineChart
            labels={labels}
            series={[
              { name: "Concluídos", values: view.series.map((p) => p.delivered), color: "chart-1" },
              { name: "Criados", values: view.series.map((p) => p.created), color: "chart-2" },
            ]}
            format={(v) => num(v, 1)}
            ariaLabel={`Criados e concluídos por semana: ${num(view.sum.created)} criados, ${num(view.sum.delivered)} concluídos`}
          />
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {person ? (
          <ChartFrame
            title="Carga ao longo do tempo"
            legend={[{ label: "Entregues", color: "chart-1" }, { label: "Em andamento", color: "chart-2" }]}
            table={{ columns: ["Semana", "Entregues", "Em andamento"], rows: view.series.map((p, i) => [labels[i], p.delivered, p.inProgress]) }}
          >
            <LineChart
              labels={labels}
              series={[
                { name: "Entregues", values: view.series.map((p) => p.delivered), color: "chart-1" },
                { name: "Em andamento", values: view.series.map((p) => p.inProgress), color: "chart-2" },
              ]}
              format={(v) => num(v, 1)}
              ariaLabel={`Carga de ${subject} por semana`}
            />
          </ChartFrame>
        ) : (
          <ChartFrame
            title="Por pessoa"
            legend={[{ label: "Entregues no período", color: "chart-1" }, { label: "Em andamento agora", color: "chart-2" }]}
            table={{ columns: ["Pessoa", "Entregues", "Em andamento"], rows: view.people.map((r) => [r.person.name, r.delivered, r.inProgress]) }}
          >
            <HBarChart
              rows={view.people.map((r) => ({ id: r.person.id, name: r.person.name, a: r.delivered, b: r.inProgress }))}
              aLabel="Entregues"
              bLabel="Em andamento"
            />
          </ChartFrame>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <ChartFrame
            title="Tempo médio (dias)"
            legend={view.team ? [{ label: subject, color: "chart-1" }, { label: refName, color: "chart-ref", dashed: true }] : undefined}
            table={{
              columns: view.team ? ["Semana", "Dias", refName] : ["Semana", "Dias"],
              rows: view.series.map((p, i) =>
                view.team ? [labels[i], days(p.avgCycleDays), days(view.team[i].avgCycleDays)] : [labels[i], days(p.avgCycleDays)],
              ),
            }}
          >
            <LineChart
              labels={labels}
              height={160}
              series={[
                { name: subject, values: view.series.map((p) => p.avgCycleDays), color: "chart-1" },
                ...(view.team ? [{ name: refName, values: view.team.map((p) => p.avgCycleDays), color: "chart-ref" as const, dashed: true }] : []),
              ]}
              format={(v) => num(v, 1)}
              ariaLabel={`Tempo médio para concluir de ${subject}: ${days(view.sum.avgCycleDays)}`}
            />
          </ChartFrame>
          <ChartFrame
            title="No prazo (%)"
            legend={view.team ? [{ label: subject, color: "chart-1" }, { label: refName, color: "chart-ref", dashed: true }] : undefined}
            table={{
              columns: view.team ? ["Semana", "No prazo", refName] : ["Semana", "No prazo"],
              rows: view.series.map((p, i) =>
                view.team ? [labels[i], pct(p.onTimeRate), pct(view.team[i].onTimeRate)] : [labels[i], pct(p.onTimeRate)],
              ),
            }}
          >
            <LineChart
              labels={labels}
              height={160}
              series={[
                { name: subject, values: view.series.map((p) => (p.onTimeRate == null ? null : p.onTimeRate * 100)), color: "chart-1" },
                ...(view.team
                  ? [{ name: refName, values: view.team.map((p) => (p.onTimeRate == null ? null : p.onTimeRate * 100)), color: "chart-ref" as const, dashed: true }]
                  : []),
              ]}
              format={(v) => `${num(v)}%`}
              ariaLabel={`Entregas no prazo de ${subject}: ${pct(view.sum.onTimeRate)}`}
            />
          </ChartFrame>
        </div>
      </div>
    </div>
  );
}
