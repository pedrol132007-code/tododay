// Gera supabase/setup_producao.sql: todas as migrations de supabase/migrations/, em ordem, num
// arquivo só, para montar um projeto Supabase novo colando uma vez no SQL Editor.
// Rode: npm run gen:setup (o CI confere se está em dia).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "supabase/migrations";
const OUT = "supabase/setup_producao.sql";

const files = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const first = files[0].slice(0, 4);
const last = files.at(-1).slice(0, 4);

const parts = files.map((f) => `-- ════════ ${f} ════════\n${readFileSync(`${DIR}/${f}`, "utf8").replace(/\r\n/g, "\n").trimEnd()}\n`);

writeFileSync(
  OUT,
  `-- GERADO por npm run gen:setup: junção de supabase/migrations/${first}..${last}, para aplicar tudo de uma vez
-- num projeto novo. Não edite aqui; a fonte são as migrations. Rode inteiro no SQL Editor.

${parts.join("\n")}`,
);
console.log(`${OUT}: ${files.length} migrations (${first}..${last})`);
