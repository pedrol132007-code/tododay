// A linha de resumo de cada gráfico do dashboard, gerada por regras. Sempre sobre o período do
// filtro (os pontos são os do gráfico); sem nada relevante, uma frase neutra ou nenhuma. Os
// limites ficam em dashboardRules (SUMMARY_SMALL_BASE, SUMMARY_DROP, MIN_CHANGE).
import { MIN_CHANGE, SUMMARY_DROP, SUMMARY_SMALL_BASE } from "./dashboardRules";

/** Um ponto do gráfico: o rótulo do eixo e os números do dia ou da semana. */
export interface SummaryPoint {
  label: string;
  created: number;
  delivered: number;
  inProgressAtEnd: number;
}

export type Grain = "day" | "week";

const num = (v: number, digits = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const plural = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;
const sum = (values: number[]) => values.reduce((a, v) => a + v, 0);

const GRAIN = {
  day: { one: "dia", many: "dias", of: "dos", best: "Melhor dia:", last: "O último dia", others: "dos outros dias" },
  week: { one: "semana", many: "semanas", of: "das", best: "Melhor semana: a de", last: "A última semana", others: "das outras semanas" },
} as const;

/**
 * Entregas: uma queda relevante na última semana, senão a melhor semana (ou dia). Por dia não
 * aponta queda do último ponto: fim de semana zera as entregas e não é notícia.
 */
export function deliveriesSummary(points: SummaryPoint[], grain: Grain): string | null {
  if (points.length < 2) return null;
  const g = GRAIN[grain];
  const values = points.map((p) => p.delivered);
  const total = sum(values);
  if (total === 0) return "Nenhuma entrega no período.";
  const max = Math.max(...values);
  if (max === Math.min(...values)) return `Entregas constantes no período: ${num(max)} por ${g.one}.`;

  if (grain === "week") {
    const last = values[values.length - 1];
    const rest = sum(values.slice(0, -1)) / (values.length - 1);
    if (rest > 0 && (rest - last) / rest >= SUMMARY_DROP) {
      const gap = rest < SUMMARY_SMALL_BASE ? `${num(rest - last, 1)} a menos que a média` : `${num(((rest - last) / rest) * 100)}% abaixo da média`;
      return `${g.last} teve ${plural(last, "entrega", "entregas")}, ${gap} ${g.others} do período (${num(rest, 1)}).`;
    }
  }

  const best = values.lastIndexOf(max);
  return `${g.best} ${points[best].label}, com ${plural(max, "entrega", "entregas")} (média de ${num(total / values.length, 1)} por ${g.one} no período).`;
}

/** Criados x concluídos: quem ganhou na maioria dos pontos do período, com os totais. */
export function flowSummary(points: SummaryPoint[], grain: Grain): string | null {
  const created = sum(points.map((p) => p.created));
  const delivered = sum(points.map((p) => p.delivered));
  if (created === 0 && delivered === 0) return null;
  const g = GRAIN[grain];
  const out = points.filter((p) => p.delivered > p.created).length;
  const into = points.filter((p) => p.created > p.delivered).length;
  const of = `${g.of} ${num(points.length)} ${points.length === 1 ? g.one : g.many} do período`;
  if (out > points.length / 2) return `Concluídos superaram criados em ${num(out)} ${of} (${num(delivered)} concluídos, ${num(created)} criados).`;
  if (into > points.length / 2) return `Criados superaram concluídos em ${num(into)} ${of} (${num(created)} criados, ${num(delivered)} concluídos).`;
  // "Estável" só quando entrou o mesmo que saiu; senão contradiria o resumo do backlog.
  const totals = `${num(created)} criados, ${num(delivered)} concluídos`;
  if (Math.abs(created - delivered) < MIN_CHANGE.tasks) return `Fluxo estável no período: ${totals}.`;
  return `Criados e concluídos se alternaram no período: ${totals}.`;
}

/** Backlog: quanto cresceu ou diminuiu no período (criadas − entregues), sempre em tarefas. */
export function backlogSummary(change: number): string {
  if (Math.abs(change) < MIN_CHANGE.tasks) return "Backlog estável no período.";
  return `Backlog ${change > 0 ? "cresceu" : "diminuiu"} ${plural(Math.abs(change), "tarefa", "tarefas")} no período.`;
}

/** Carga de uma pessoa: o em andamento do primeiro ao último ponto do período. */
export function loadSummary(points: SummaryPoint[]): string | null {
  if (points.length < 2) return null;
  const first = points[0].inProgressAtEnd;
  const last = points[points.length - 1].inProgressAtEnd;
  if (first === last) return `Em andamento estável no período: ${plural(last, "tarefa", "tarefas")}.`;
  return `Em andamento foi de ${num(first)} para ${plural(last, "tarefa", "tarefas")} ao longo do período.`;
}
