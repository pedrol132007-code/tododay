export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 1;
  if (prev === null) return next! - 1;
  if (next === null) return prev + 1;
  return (prev + next) / 2;
}

export function needsRebalance(prev: number, next: number): boolean {
  return next - prev < 1e-7;
}

export function rebalance<T extends { position: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, position: index + 1 }));
}

export function resolveInsertPosition(
  siblings: { id: number; position: number }[],
  targetIndex: number,
): { position: number; rebalanced?: { id: number; position: number }[] } {
  const prev = siblings[targetIndex - 1] ?? null;
  const next = siblings[targetIndex] ?? null;
  if (prev && next && needsRebalance(prev.position, next.position)) {
    const rebalanced = rebalance(siblings);
    const cleanPrev = rebalanced[targetIndex - 1] ?? null;
    const cleanNext = rebalanced[targetIndex] ?? null;
    return {
      position: positionBetween(cleanPrev?.position ?? null, cleanNext?.position ?? null),
      rebalanced,
    };
  }
  return { position: positionBetween(prev?.position ?? null, next?.position ?? null) };
}

/** Posição no topo ou no fim de uma coluna, sem contar o próprio card (o "Mover para…" do painel). */
export function edgePosition<T extends { id: number; position: number }>(cards: T[], edge: "top" | "end", selfId: number): number {
  const others = cards.filter((c) => c.id !== selfId).map((c) => c.position);
  if (others.length === 0) return 1;
  return edge === "top" ? positionBetween(null, Math.min(...others)) : positionBetween(Math.max(...others), null);
}
