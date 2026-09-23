// Picked to read well on the app's dark purple background and to stay distinct from each
// other; status colors (src/lib/status.ts) are deliberately not in this list.
export const MEMBER_COLORS = [
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#fb923c",
  "#c084fc",
  "#22d3ee",
  "#f87171",
  "#a3e635",
  "#e879f9",
  "#fbbf24",
];

export function nextMemberColor(usedColors: string[]): string {
  const used = new Set(usedColors.map((c) => c.toLowerCase()));
  const free = MEMBER_COLORS.find((c) => !used.has(c));
  return free ?? MEMBER_COLORS[usedColors.length % MEMBER_COLORS.length];
}
