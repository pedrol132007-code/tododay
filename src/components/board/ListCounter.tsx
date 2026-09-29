import { isOverWip } from "../../lib/dashboardRules";

/** Contador do cabeçalho da coluna: "4", ou "4/3" com limite de WIP (em alerta acima dele; não bloqueia). */
export function ListCounter({ count, wipLimit }: { count: number; wipLimit: number | null }) {
  const overWip = isOverWip(count, wipLimit);
  return (
    <span
      className={`rounded-md px-1.5 text-xs tabular-nums ${overWip ? "bg-danger/10 font-semibold text-danger" : "text-text-muted"}`}
      title={
        wipLimit == null
          ? `${count} ${count === 1 ? "tarefa" : "tarefas"}`
          : `${count} de no máximo ${wipLimit}${overWip ? " — acima do limite de WIP" : ""}`
      }
    >
      {wipLimit == null ? count : `${count}/${wipLimit}`}
    </span>
  );
}
