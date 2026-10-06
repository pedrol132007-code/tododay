import { describe, expect, it } from "vitest";
import { showsListStatus } from "./boardVisuals";
import { defaultListRows } from "./defaultLists";

describe("colunas padrão de um board novo", () => {
  it("A fazer, Em andamento e Concluído (os mesmos nomes dos tipos, sem subtítulo), cada uma com o tipo que o dashboard usa, em ordem", () => {
    expect(defaultListRows(42)).toEqual([
      { board_id: 42, name: "A fazer", status: "todo", position: 1 },
      { board_id: 42, name: "Em andamento", status: "doing", position: 2 },
      { board_id: 42, name: "Concluído", status: "done", position: 3 },
    ]);
  });

  it("nenhuma coluna padrão mostra o tipo como subtítulo (o nome já é o tipo)", () => {
    for (const list of defaultListRows(1)) expect(showsListStatus(list.name, list.status)).toBe(false);
  });
});
