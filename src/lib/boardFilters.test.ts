import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  filtersToSearch,
  hasFilters,
  matchesFilters,
  parseFilters,
  personSlugs,
  slugify,
  sortCards,
  type BoardFilters,
  type FilterableCard,
} from "./boardFilters";

const DAY = "2026-09-28";

const card = (over: Partial<FilterableCard> = {}): FilterableCard => ({
  title: "Revisar contrato",
  assigneeSlug: null,
  priority: null,
  labelSlugs: [],
  dueDay: null,
  listStatus: "todo",
  enteredDay: DAY,
  ...over,
});

const f = (over: Partial<BoardFilters>): BoardFilters => ({ ...EMPTY_FILTERS, ...over });

describe("URL", () => {
  it("lê o exemplo do dashboard", () => {
    expect(parseFilters("?responsavel=ana&atrasadas=1")).toEqual(f({ assignee: "ana", due: "overdue" }));
  });

  it("ida e volta com todos os filtros", () => {
    const all = f({ q: "contrato", assignee: "ana", priority: "high", label: "financeiro", due: "soon", stalled: 7, sort: "due" });
    expect(filtersToSearch(all)).toBe("?busca=contrato&responsavel=ana&prioridade=alta&etiqueta=financeiro&vencendo=1&paradas=7&ordem=prazo");
    expect(parseFilters(filtersToSearch(all))).toEqual(all);
  });

  it("sem filtro não deixa query; mantém outros parâmetros da URL", () => {
    expect(filtersToSearch(EMPTY_FILTERS)).toBe("");
    expect(filtersToSearch(f({ assignee: "ana" }), "?x=1&responsavel=bruno")).toBe("?x=1&responsavel=ana");
  });

  it("tipo de coluna na URL", () => {
    expect(parseFilters("?coluna=andamento")).toEqual(f({ column: "doing" }));
    expect(parseFilters("?coluna=abertas")).toEqual(f({ column: "open" }));
    expect(filtersToSearch(f({ column: "doing", assignee: "ana" }))).toBe("?responsavel=ana&coluna=andamento");
    expect(hasFilters(f({ column: "open" }))).toBe(true);
  });

  it("ignora valores que não existem", () => {
    expect(parseFilters("?prioridade=altissima&paradas=abc&ordem=nada&atrasadas=sim")).toEqual(EMPTY_FILTERS);
  });
});

describe("filtro por tipo de coluna", () => {
  it("em andamento: só colunas do tipo Em andamento (inclui Em revisão)", () => {
    expect(matchesFilters(card({ listStatus: "doing" }), f({ column: "doing" }), DAY)).toBe(true);
    expect(matchesFilters(card({ listStatus: "todo" }), f({ column: "doing" }), DAY)).toBe(false);
    expect(matchesFilters(card({ listStatus: "done" }), f({ column: "doing" }), DAY)).toBe(false);
  });

  it("abertas: tudo que não está numa coluna Concluído", () => {
    expect(matchesFilters(card({ listStatus: "todo" }), f({ column: "open" }), DAY)).toBe(true);
    expect(matchesFilters(card({ listStatus: "doing" }), f({ column: "open" }), DAY)).toBe(true);
    expect(matchesFilters(card({ listStatus: "done" }), f({ column: "open" }), DAY)).toBe(false);
  });
});

describe("slugs", () => {
  it("tira acento e espaço", () => {
    expect(slugify("Jurídico & Compras")).toBe("juridico-compras");
  });

  it("usa o primeiro nome, e o nome todo quando o primeiro se repete", () => {
    const slugs = personSlugs([
      { id: "1", name: "Ana Souza" },
      { id: "2", name: "Élio Dias" },
      { id: "3", name: "Ana Prado" },
    ]);
    expect([...slugs.values()]).toEqual(["ana-souza", "elio", "ana-prado"]);
  });
});

describe("matchesFilters", () => {
  it("sem filtro, passa tudo", () => {
    expect(hasFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasFilters(f({ sort: "priority" }))).toBe(false);
    expect(matchesFilters(card(), EMPTY_FILTERS, DAY)).toBe(true);
  });

  it("busca no título sem ligar para maiúsculas e acentos", () => {
    expect(matchesFilters(card({ title: "Emitir Nota Fiscal" }), f({ q: "nota fisc" }), DAY)).toBe(true);
    expect(matchesFilters(card({ title: "Revisão do orçamento" }), f({ q: "revisao orcamento" }), DAY)).toBe(false);
    expect(matchesFilters(card({ title: "Revisão do orçamento" }), f({ q: "revisao do orc" }), DAY)).toBe(true);
  });

  it("responsável, prioridade e etiqueta", () => {
    const c = card({ assigneeSlug: "ana", priority: "high", labelSlugs: ["financeiro", "cliente"] });
    expect(matchesFilters(c, f({ assignee: "ana", priority: "high", label: "cliente" }), DAY)).toBe(true);
    expect(matchesFilters(c, f({ assignee: "bruno" }), DAY)).toBe(false);
    expect(matchesFilters(c, f({ priority: "urgent" }), DAY)).toBe(false);
    expect(matchesFilters(c, f({ label: "juridico" }), DAY)).toBe(false);
  });

  it("atrasadas e vencendo seguem as regras do Atenção; coluna Concluído nunca alerta", () => {
    expect(matchesFilters(card({ dueDay: "2026-09-27" }), f({ due: "overdue" }), DAY)).toBe(true);
    expect(matchesFilters(card({ dueDay: "2026-09-27", listStatus: "done" }), f({ due: "overdue" }), DAY)).toBe(false);
    expect(matchesFilters(card({ dueDay: "2026-10-01" }), f({ due: "soon" }), DAY)).toBe(true);
    expect(matchesFilters(card({ dueDay: "2026-10-02" }), f({ due: "soon" }), DAY)).toBe(false);
    expect(matchesFilters(card(), f({ due: "overdue" }), DAY)).toBe(false);
  });

  it("paradas há mais de N dias, só em coluna Em andamento", () => {
    const old = { enteredDay: "2026-09-20" }; // 8 dias
    expect(matchesFilters(card({ ...old, listStatus: "doing" }), f({ stalled: 7 }), DAY)).toBe(true);
    expect(matchesFilters(card({ ...old, listStatus: "doing" }), f({ stalled: 8 }), DAY)).toBe(false);
    expect(matchesFilters(card({ ...old, listStatus: "todo" }), f({ stalled: 7 }), DAY)).toBe(false);
  });
});

describe("sortCards", () => {
  const cards = [
    card({ title: "a", priority: "low", dueDay: "2026-10-05", listStatus: "doing", enteredDay: "2026-09-25" }),
    card({ title: "b", priority: null, dueDay: null, listStatus: "doing", enteredDay: "2026-09-10" }),
    card({ title: "c", priority: "urgent", dueDay: "2026-09-30", listStatus: "doing", enteredDay: "2026-09-27" }),
    card({ title: "d", priority: "low", dueDay: "2026-09-29", listStatus: "doing", enteredDay: "2026-09-28" }),
  ];
  const order = (sort: BoardFilters["sort"]) => sortCards(cards, sort, (c) => c, DAY).map((c) => c.title).join("");

  it("manual mantém a ordem do board", () => expect(order("manual")).toBe("abcd"));
  it("prioridade: urgente primeiro, sem prioridade por último, empate na ordem do board", () => expect(order("priority")).toBe("cadb"));
  it("prazo: o mais próximo primeiro, sem prazo por último", () => expect(order("due")).toBe("dcab"));
  it("parada: há mais tempo primeiro", () => expect(order("stalled")).toBe("bacd"));
});
