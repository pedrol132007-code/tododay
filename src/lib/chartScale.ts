// Escalas dos gráficos do dashboard: eixo com passo "redondo" e espaçamento de rótulos.

export interface Axis {
  max: number;
  ticks: number[];
}

const MAX_INTERVALS = 5;

/**
 * Eixo de 0 até pouco acima de `max`: escolhe primeiro o passo (1, 2 ou 5 × 10^k), o menor que
 * cabe em até 5 intervalos, e arredonda o topo para um múltiplo dele. Com `integer` o passo nunca
 * é menor que 1 (contagens não têm marcação "2,5").
 */
export function axis(max: number, { integer = false }: { integer?: boolean } = {}): Axis {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const base = Math.pow(10, Math.floor(Math.log10(max / MAX_INTERVALS)));
  let step = base;
  for (const m of [1, 2, 5, 10, 20, 50]) {
    step = base * m;
    if (integer && step < 1) continue;
    if (Math.ceil(max / step - 1e-9) <= MAX_INTERVALS) break;
  }
  if (integer) step = Math.max(1, step);
  const count = Math.max(1, Math.ceil(max / step - 1e-9));
  const ticks = Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)));
  return { max: ticks[count], ticks };
}

/** De quantos em quantos rótulos do eixo X mostrar para caberem em `width` px. */
export function labelStep(count: number, width: number, minGap = 56): number {
  const fit = Math.max(1, Math.floor(width / minGap));
  return Math.max(1, Math.ceil(count / fit));
}
