// Manifesto do backup diário (.github/workflows/backup.yml): quantas linhas de cada tabela o arquivo
// de dados tem. Sai do próprio arquivo, não de outra consulta ao banco, para ser a mesma foto.
// Aceita os dois formatos do pg_dump: INSERT (uma ou várias linhas por comando) e COPY.

const INSERT = /^INSERT INTO "?([a-z_]+)"?\."?([a-z_]+)"?/;
const COPY = /^COPY "?([a-z_]+)"?\."?([a-z_]+)"?.* FROM stdin;$/;

/** Linhas por tabela ("schema.tabela"). Bloco COPY vazio conta 0; INSERT só existe com dados. */
export function countRows(sql: string): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (table: string, n: number) => counts.set(table, (counts.get(table) ?? 0) + n);
  const lines = sql.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const copy = lines[i].match(COPY);
    if (copy) {
      const start = i;
      while (i + 1 < lines.length && lines[i + 1] !== "\\.") i++;
      add(`${copy[1]}.${copy[2]}`, i - start);
      i++; // a linha "\."
      continue;
    }
    const insert = lines[i].match(INSERT);
    if (insert) {
      const { rows, endLine } = scanInsert(lines, i);
      add(`${insert[1]}.${insert[2]}`, rows);
      i = endLine;
    }
  }
  return counts;
}

/**
 * Percorre um INSERT até o ";" final, fora de aspas: cada "(" no nível de fora, depois do VALUES,
 * é uma linha. Texto entre aspas simples ('' é aspa escapada) e nomes entre aspas duplas não contam.
 */
function scanInsert(lines: string[], first: number): { rows: number; endLine: number } {
  let rows = 0;
  let depth = 0;
  let quote: "'" | '"' | null = null;
  let afterValues = false;
  let word = "";
  for (let l = first; l < lines.length; l++) {
    const line = lines[l];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (quote) {
        if (ch === quote) {
          if (line[c + 1] === quote) c++;
          else quote = null;
        }
        continue;
      }
      if (ch === "'" || ch === '"') quote = ch;
      else if (ch === "(") {
        if (depth === 0 && afterValues) rows++;
        depth++;
      } else if (ch === ")") depth--;
      else if (ch === ";" && depth === 0) return { rows, endLine: l };
      if (depth === 0 && /[A-Za-z]/.test(ch)) {
        word += ch;
        if (word.toUpperCase() === "VALUES") afterValues = true;
      } else word = "";
    }
    word = "";
  }
  return { rows, endLine: lines.length - 1 };
}

export function formatManifest(counts: Map<string, number>): string {
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([table, n]) => `${table}\t${n}\n`)
    .join("");
}

/** Diferenças entre o manifesto e o que foi restaurado; vazio = confere. */
export function diffManifest(expected: string, actual: Map<string, number>): string[] {
  const want = new Map(
    expected
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [table, n] = line.split("\t");
        return [table, Number(n)] as const;
      }),
  );
  if (![...want.values()].some((n) => n > 0)) return ["manifesto vazio: o backup não tem dados"];
  const tables = [...new Set([...want.keys(), ...actual.keys()])].sort();
  return tables
    .filter((t) => (want.get(t) ?? 0) !== (actual.get(t) ?? 0))
    .map((t) => `${t}: esperado ${want.get(t) ?? 0}, restaurado ${actual.get(t) ?? 0}`);
}
