// Escalas dos gráficos do dashboard: máximo "redondo" do eixo, marcações e espaçamento de rótulos.

const NICE = [1, 2, 2.5, 5, 10];

export function niceMax(max: number): number {
  if (!(max > 0)) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  return (NICE.find((n) => f <= n) ?? 10) * exp;
}

export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * i);
}

/** De quantos em quantos rótulos do eixo X mostrar para caberem em `width` px. */
export function labelStep(count: number, width: number, minGap = 56): number {
  const fit = Math.max(1, Math.floor(width / minGap));
  return Math.max(1, Math.ceil(count / fit));
}
