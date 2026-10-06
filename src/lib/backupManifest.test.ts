import { describe, expect, it } from "vitest";
import { countRows, diffManifest, formatManifest } from "./backupManifest";

// O `supabase db dump --data-only` pode escrever os dados como INSERT (uma ou várias linhas por
// comando) ou como COPY; a contagem precisa acertar nos dois, mesmo com texto "parecido" com SQL
// dentro das descrições dos cards.

const inserts = [
  "SET session_replication_role = replica;",
  "",
  'INSERT INTO "auth"."users" ("id", "email") VALUES',
  "\t('a', 'x@y');",
  "",
  'INSERT INTO "public"."card" ("id", "title", "description") VALUES',
  "\t(1, 'a), (b', 'linha 1\n\t(2, ''não é linha''),\n);'),",
  "\t(2, 'b', NULL),",
  "\t(3, 'c', 'texto com ; e ( e ''aspas''');",
  "",
  'INSERT INTO "public"."team" ("id", "name") VALUES (1, \'t\');',
  'INSERT INTO "public"."team" ("id", "name") VALUES (2, \'u\');',
  "",
  "SELECT pg_catalog.setval('\"public\".\"card_id_seq\"', 3, true);",
].join("\n");

const copy = [
  "SET session_replication_role = replica;",
  'COPY "public"."card" ("id", "title") FROM stdin;',
  "1\ta\\nb",
  "2\t\\N",
  "\\.",
  "",
  'COPY "public"."label" ("id") FROM stdin;',
  "\\.",
  "",
  "COPY auth.users (id) FROM stdin;",
  "a",
  "\\.",
].join("\n");

describe("countRows", () => {
  it("conta as linhas de cada INSERT, inclusive vários VALUES num comando e texto parecido com SQL", () => {
    expect(countRows(inserts)).toEqual(new Map([["auth.users", 1], ["public.card", 3], ["public.team", 2]]));
  });

  it("conta as linhas de cada bloco COPY, com e sem aspas no nome, e o bloco vazio vale 0", () => {
    expect(countRows(copy)).toEqual(new Map([["auth.users", 1], ["public.card", 2], ["public.label", 0]]));
  });

  it("arquivo sem dados não tem tabelas", () => {
    expect(countRows("SET x = 1;\n")).toEqual(new Map());
  });
});

describe("formatManifest", () => {
  it("uma tabela por linha, ordenada", () => {
    expect(formatManifest(countRows(inserts))).toBe("auth.users\t1\npublic.card\t3\npublic.team\t2\n");
  });
});

describe("diffManifest", () => {
  const expected = "auth.users\t1\npublic.card\t3\npublic.team\t2\n";

  it("igual não tem diferença", () => {
    expect(diffManifest(expected, countRows(inserts))).toEqual([]);
  });

  it("aponta tabelas com contagem diferente, que sumiram ou que apareceram", () => {
    expect(diffManifest(expected, new Map([["public.card", 2], ["public.label", 3]]))).toEqual([
      "auth.users: esperado 1, restaurado 0",
      "public.card: esperado 3, restaurado 2",
      "public.label: esperado 0, restaurado 3",
      "public.team: esperado 2, restaurado 0",
    ]);
  });

  it("manifesto sem nenhuma linha é falha: o backup não tem dados", () => {
    expect(diffManifest("", new Map())).toEqual(["manifesto vazio: o backup não tem dados"]);
    expect(diffManifest("public.label\t0\n", new Map([["public.label", 0]]))).toEqual(["manifesto vazio: o backup não tem dados"]);
  });
});
