// Roda os testes SQL de supabase/tests/ num Postgres DESCARTÁVEL (o do `supabase db start`, no CI):
// aplica as migrations se ainda não estiverem lá, roda cada *_test.sql (que sempre termina com erro:
// "PASSOU: ..." é sucesso, qualquer outro é falha) e a auditoria de segurança (resultado vazio).
//
// Uso: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/test-db.mjs
// Nunca aponte para o dev ou o prod: os testes apagam usuários de teste e criam dados.
import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Defina DATABASE_URL (o Postgres local do supabase db start).");
if (/supabase\.(co|com)/.test(url)) throw new Error("DATABASE_URL aponta para um projeto do Supabase; os testes só rodam no banco local.");

const client = new pg.Client({ connectionString: url });
await client.connect();

const migrations = readdirSync("supabase/migrations").filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
const { rows } = await client.query("select to_regclass('public.team') is not null as ready");
if (!rows[0].ready) {
  for (const file of migrations) {
    await client.query(readFileSync(`supabase/migrations/${file}`, "utf8"));
    console.log(`aplicada ${file}`);
  }
}

let failures = 0;
const tests = readdirSync("supabase/tests").filter((f) => f.endsWith("_test.sql")).sort();
for (const file of tests) {
  let message = "terminou sem erro (todo teste precisa terminar com PASSOU)";
  try {
    await client.query(readFileSync(`supabase/tests/${file}`, "utf8"));
  } catch (e) {
    message = e.message;
  }
  const ok = message.startsWith("PASSOU");
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${file}: ${message}`);
}

const audit = await client.query(readFileSync("supabase/tests/auditoria_seguranca.sql", "utf8"));
const problems = audit.rows.map((r) => r.problema);
if (problems.length) failures++;
console.log(problems.length ? `✗ auditoria de segurança:\n  ${problems.join("\n  ")}` : "✓ auditoria de segurança: nenhum problema");

await client.end();
console.log(failures ? `\n${failures} falha(s).` : `\nTudo certo: ${migrations.length} migrations, ${tests.length} testes e a auditoria.`);
process.exit(failures ? 1 : 0);
