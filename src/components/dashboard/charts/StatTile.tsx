import type { ReactNode } from "react";
import { Sparkline } from "./Sparkline";

/**
 * Número principal do dashboard: valor, variação escrita (nunca só cor) e minigráfico. A variação
 * vem pronta do componente Variation.
 */
export function StatTile({
  label,
  value,
  unit,
  note,
  delta,
  spark,
  meter,
  onOpen,
  openLabel = "Ver tarefas",
}: {
  label: string;
  value: string;
  /** Unidade discreta ao lado do número (ex.: "dias"). */
  unit?: string;
  /** Leitura do número em frase, abaixo dele. */
  note?: ReactNode;
  /** A variação (componente Variation). */
  delta: ReactNode;
  spark?: (number | null)[];
  /** 0–1: barra de medidor sob o número (destaque de uma taxa). */
  meter?: number | null;
  /** Abre a lista das tarefas por trás do número. */
  onOpen?: () => void;
  /** O que o clique faz: "Ver tarefas" (lista aqui) ou "Ver no board". */
  openLabel?: string;
}) {
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag
      {...(onOpen ? { type: "button" as const, onClick: onOpen } : {})}
      className={`group relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border border-border bg-bg-surface p-5 text-left ${
        onOpen ? "transition-colors hover:border-primary" : ""
      }`}
    >
      {/* Faixa com o degradê azul→vermelho da marca: só decoração, não codifica dado. */}
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-chart-1 to-chart-2" aria-hidden="true" />
      <span className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {label}
        {onOpen && <span className="font-normal normal-case tracking-normal opacity-0 group-hover:opacity-100 group-hover:text-primary">{openLabel} →</span>}
      </span>
      {/* Só span aqui dentro: o bloco pode ser um <button>. */}
      <span className="flex items-end justify-between gap-3">
        <span className="text-4xl font-normal leading-none tracking-[-0.03em] text-text-primary tabular-nums">
          {value}
          {unit && <span className="ml-1.5 text-base tracking-normal text-text-muted">{unit}</span>}
        </span>
        {spark && <Sparkline values={spark} />}
      </span>
      {meter != null && (
        <span className="block h-1.5 overflow-hidden rounded-full bg-bg-elevated" aria-hidden="true">
          <span className="block h-full rounded-full bg-chart-1" style={{ width: `${Math.round(meter * 100)}%` }} />
        </span>
      )}
      {note && <span className="text-sm text-text-primary">{note}</span>}
      {delta}
    </Tag>
  );
}
