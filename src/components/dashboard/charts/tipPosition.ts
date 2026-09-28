import type { CSSProperties } from "react";

const GAP = 10;
const TIP_WIDTH = 150;

/**
 * Dica ao lado da linha guia em `guideX`: à direita na primeira metade do gráfico e à esquerda
 * depois do meio, para não cobrir os rótulos do fim das linhas.
 */
export function tipPosition(guideX: number, midX: number, width: number): CSSProperties {
  if (guideX > midX) return { right: Math.min(Math.max(0, width - guideX + GAP), width - TIP_WIDTH) };
  return { left: Math.min(Math.max(0, guideX + GAP), width - TIP_WIDTH) };
}
