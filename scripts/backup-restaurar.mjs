// Teste de restauração do backup diário: depois de o workflow carregar o arquivo de dados num
// Postgres DESCARTÁVEL (o do `supabase db start`, já com as migrations), confere a contagem de cada
// tabela do manifesto. Imprime só contagens, nunca dados: o log do Actions é público.
//
// Uso: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//        node scripts/backup-restaurar.mjs manifesto.txt
// Nunca aponte para o dev ou o prod. Recuperar o prod de verdade é manual (docs/BACKUP.md).
import { readFileSync } from "node:fs";
import pg from "pg";
import { diffManifest } from "../src/lib/backupManifest.ts";

const [manifestFile] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!manifestFile || !url) throw new Error("Uso: DATABASE_URL=… node scripts/backup-restaurar.mjs <manifesto.txt>");
if (/supabase\.(co|com)/.test(url)) throw new Error("DATABASE_URL aponta para um projeto do Supabase; a restauração de teste só roda no banco local.");

const manifest = readFileSync(manifestFile, "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();
const restored = new Map();
for (const line of manifest.split("\n").filter(Boolean)) {
  const [schema, table] = line.split("\t")[0].split(".");
  const { rows } = await client.query(`select count(*)::int as n from ${client.escapeIdentifier(schema)}.${client.escapeIdentifier(table)}`);
  restored.set(`${schema}.${table}`, rows[0].n);
}
await client.end();

const problems = diffManifest(manifest, restored);
for (const [table, n] of restored) console.log(`${table}\t${n}`);
console.log(problems.length ? `\n✗ restauração não bate:\n  ${problems.join("\n  ")}` : "\n✓ restauração confere com o manifesto");
process.exit(problems.length ? 1 : 0);
