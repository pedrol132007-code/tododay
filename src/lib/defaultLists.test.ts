import { describe, expect, it } from "vitest";
import { defaultListRows } from "./defaultLists";

describe("colunas padrão de um board novo", () => {
  it("A fazer, Em andamento e Feito, cada uma com o tipo que o dashboard usa, em ordem", () => {
    expect(defaultListRows(42)).toEqual([
      { board_id: 42, name: "A fazer", status: "todo", position: 1 },
      { board_id: 42, name: "Em andamento", status: "doing", position: 2 },
      { board_id: 42, name: "Feito", status: "done", position: 3 },
    ]);
  });
});
