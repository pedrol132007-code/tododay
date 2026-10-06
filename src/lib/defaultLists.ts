import { LIST_STATUS_LABEL } from "./boardVisuals";
import type { ListStatus } from "../types";

// Todo board novo já nasce com uma coluna de cada tipo que o dashboard usa para medir (a fazer, em
// andamento, concluído), com o próprio nome do tipo: assim nenhuma mostra o tipo como subtítulo.
// O admin renomeia, cria ou exclui depois.
const DEFAULT_STATUSES: ListStatus[] = ["todo", "doing", "done"];

export function defaultListRows(boardId: number) {
  return DEFAULT_STATUSES.map((status, i) => ({ board_id: boardId, name: LIST_STATUS_LABEL[status], status, position: i + 1 }));
}
