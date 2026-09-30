// Variação de uma métrica do dashboard: o único lugar que decide seta, cor e texto. A direção boa de
// cada métrica e o limite de "estável" ficam em dashboardRules (METRICS e MIN_CHANGE).
import { METRICS, MIN_CHANGE, type MetricId, type VariationUnit } from "./dashboardRules";
import type { Tone } from "./metrics";

export interface Variation {
  /** Só a direção do número. */
  direction: "up" | "down" | "flat";
  /** Se a mudança é boa ou ruim. */
  tone: Tone;
  /** "▲ +9 tarefas no período". */
  text: string;
  /** A leitura em frase e os dois valores. */
  tooltip: string;
}

const num = (v: number, digits = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const oneDecimal = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Diferença como o texto mostra (p.p. inteiros, dias com uma casa): a decisão usa este número. */
function roundedDiff(unit: VariationUnit, current: number, previous: number): number {
  if (unit === "points") return Math.round((current - previous) * 100);
  if (unit === "days") return Math.round((current - previous) * 10) / 10;
  return current - previous;
}

function amount(unit: VariationUnit, v: number): string {
  if (unit === "points") return `${num(v)} p.p.`;
  if (unit === "days") return `${oneDecimal(v)} ${v < 2 ? "dia" : "dias"}`;
  return `${num(v)} ${v === 1 ? "tarefa" : "tarefas"}`;
}

/** Um valor da métrica, para o tooltip. */
function value(unit: VariationUnit, v: number): string {
  if (unit === "points") return `${num(v * 100)}%`;
  if (unit === "days") return `${num(v, 1)} ${Math.round(v * 10) === 10 ? "dia" : "dias"}`;
  return num(v);
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function variation(metric: MetricId, current: number | null, previous: number | null): Variation | null {
  if (current == null || previous == null) return null;
  const cfg = METRICS[metric];
  const diff = roundedDiff(cfg.unit, current, previous);
  const direction = Math.abs(diff) < MIN_CHANGE[cfg.unit] ? "flat" : diff > 0 ? "up" : "down";
  const tone: Tone = direction === "flat" ? "neutral" : (direction === "up") === (cfg.better === "up") ? "good" : "bad";

  const scope = cfg.scope === "period" ? "no período" : "vs. período anterior";
  const text =
    direction === "flat" ? `estável ${scope}` : `${direction === "up" ? "▲ +" : "▼ −"}${amount(cfg.unit, Math.abs(diff))} ${scope}`;

  const verbs = cfg.plural
    ? { up: "aumentaram", down: "diminuíram", flat: "ficaram estáveis" }
    : { up: "aumentou", down: "diminuiu", flat: "ficou estável" };
  let reading = `${capitalize(cfg.subject)} ${verbs[direction]}`;
  if (direction !== "flat") {
    reading += ` — ${tone === "good" ? "melhora" : "piora"}`;
    if (cfg.meaning) reading += `: ${cfg.meaning[direction]}`;
  }
  const values =
    cfg.scope === "period"
      ? `Era ${value(cfg.unit, previous)} no início do período, agora ${value(cfg.unit, current)}.`
      : `Período anterior: ${value(cfg.unit, previous)}; este período: ${value(cfg.unit, current)}.`;

  return { direction, tone, text, tooltip: `${reading}. ${values}` };
}
