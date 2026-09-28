import type { ReactNode } from "react";
import type { Tone } from "../../../lib/metrics";
import { Sparkline } from "./Sparkline";

const TONE_CLASS: Record<Tone, string> = {
  good: "text-success",
  bad: "text-danger",
  neutral: "text-text-muted",
};

/**
 * Número principal do dashboard: valor, variação escrita (nunca só cor) e minigráfico. A cor da
 * variação diz se a mudança é boa ou ruim (`tone`), não para onde a seta aponta.
 */
export function StatTile({
  label,
  value,
  unit,
  note,
  delta,
  tone = "neutral",
  spark,
  meter,
}: {
  label: string;
  value: string;
  /** Unidade discreta ao lado do número (ex.: "dias"). */
  unit?: string;
  /** Leitura do número em frase, abaixo dele. */
  note?: ReactNode;
  delta?: string | null;
  tone?: Tone;
  spark?: number[];
  /** 0–1: barra de medidor sob o número (destaque de uma taxa). */
  meter?: number | null;
}) {
  return (
    <div className="relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-bg-surface p-5">
      {/* Faixa com o degradê azul→vermelho da marca: só decoração, não codifica dado. */}
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-chart-1 to-chart-2" aria-hidden="true" />
      <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="text-4xl font-normal leading-none tracking-[-0.03em] text-text-primary tabular-nums">
          {value}
          {unit && <span className="ml-1.5 text-base tracking-normal text-text-muted">{unit}</span>}
        </span>
        {spark && <Sparkline values={spark} />}
      </div>
      {meter != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-bg-elevated" aria-hidden="true">
          <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.round(meter * 100)}%` }} />
        </div>
      )}
      {note && <span className="text-sm text-text-primary">{note}</span>}
      <span className={`text-xs ${delta ? TONE_CLASS[tone] : "text-text-muted"}`}>{delta ?? "—"}</span>
    </div>
  );
}
