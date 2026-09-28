// Classes completas por cor (o Tailwind só gera classes que aparecem escritas no código).
export type ChartColor = "chart-1" | "chart-2" | "chart-ref";

export const STROKE: Record<ChartColor, string> = {
  "chart-1": "stroke-chart-1",
  "chart-2": "stroke-chart-2",
  "chart-ref": "stroke-chart-ref",
};

export const FILL: Record<ChartColor, string> = {
  "chart-1": "fill-chart-1",
  "chart-2": "fill-chart-2",
  "chart-ref": "fill-chart-ref",
};

export const BG: Record<ChartColor, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-ref": "bg-chart-ref",
};
