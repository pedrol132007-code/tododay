import type { ListStatus } from "../types";

// Todo board novo já nasce com estas colunas, cada uma com o tipo que o dashboard usa para medir
// (a fazer, em andamento, entregue). O admin renomeia, cria ou exclui depois.
const DEFAULT_LISTS: { name: string; status: ListStatus }[] = [
  { name: "A fazer", status: "todo" },
  { name: "Em andamento", status: "doing" },
  { name: "Feito", status: "done" },
];

export function defaultListRows(boardId: number) {
  return DEFAULT_LISTS.map((list, i) => ({ board_id: boardId, ...list, position: i + 1 }));
}
