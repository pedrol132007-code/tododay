// npm run check:prod — confere se o Supabase que o site publicado usa tem tudo o que o repositório
// espera: as tabelas e colunas das migrations, os buckets e as Edge Functions. Rode antes de
// publicar (a 0011 e a função "attachments" já ficaram só no projeto de dev uma vez).
//
// Não usa segredo: lê o endereço do projeto e a chave pública (anon) do JavaScript do próprio site,
// como qualquer visitante, e só faz perguntas de leitura. Sem login, o banco nega os dados, mas
// responde diferente para "não existe" e para "sem permissão", e é isso que se confere.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { environmentOf } from "../src/lib/environment.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = process.env.TODODAY_SITE ?? "https://tododay-nu.vercel.app";

/** O que as migrations criam (tabelas, colunas acrescentadas e buckets), com o arquivo de cada um. */
export function expectedFromMigrations(dir = join(ROOT, "supabase/migrations")) {
  const tables = new Map(); // tabela → migration
  const columns = new Map(); // "tabela.coluna" → migration
  const buckets = new Map();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, file), "utf8").replace(/--.*$/gm, "");
    for (const [, t] of sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)) tables.set(t, file);
    for (const [, t] of sql.matchAll(/drop table (?:if exists )?public\.(\w+)/gi)) tables.delete(t);
    for (const [, t, body] of sql.matchAll(/alter table (?:only )?public\.(\w+)([^;]*);/gi)) {
      for (const [, c] of body.matchAll(/add column (?:if not exists )?(\w+)/gi)) columns.set(`${t}.${c}`, file);
      for (const [, c] of body.matchAll(/drop column (?:if exists )?(\w+)/gi)) columns.delete(`${t}.${c}`);
    }
    for (const [, b] of sql.matchAll(/insert into storage\.buckets\s*\([^)]*\)\s*values\s*\(\s*'([^']+)'/gi)) buckets.set(b, file);
  }
  return { tables, columns, buckets };
}

export const edgeFunctions = (dir = join(ROOT, "supabase/functions")) =>
  readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

/** Endereço do Supabase e chave pública, tirados do JavaScript servido pelo site. */
async function projectOfSite(site) {
  const html = await (await fetch(site)).text();
  const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const src of scripts) {
    const js = await (await fetch(new URL(src, site))).text();
    const url = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
    const key = js.match(/sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
    if (url && key) return { url, key };
  }
  throw new Error(`Não achei o endereço do Supabase no JavaScript de ${site}.`);
}

/** Cada pergunta devolve true (existe), false (não existe) ou uma frase (resposta inesperada). */
export function probes({ url, key }) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const rest = async (table, select) => {
    const res = await fetch(`${url}/rest/v1/${table}?select=${select}&limit=0`, { headers });
    const body = await res.json().catch(() => ({}));
    if (body.code === "PGRST205" || body.code === "42P01" || body.code === "42703") return false; // tabela ou coluna não existe
    if (res.ok || body.code === "42501") return true; // existe (com ou sem permissão para ler)
    return `resposta inesperada ${res.status} ${body.code ?? ""}`;
  };
  return {
    table: (t) => rest(t, "*"),
    column: (tc) => rest(tc.split(".")[0], tc.split(".")[1]),
    bucket: async (b) => {
      const res = await fetch(`${url}/storage/v1/object/info/authenticated/${b}/check-prod-inexistente`, { headers });
      const body = await res.json().catch(() => ({}));
      if (body.code === "NoSuchBucket") return false;
      if (body.code === "NoSuchKey") return true;
      return `resposta inesperada ${res.status} ${body.code ?? ""}`;
    },
    // Sem login a função responde 401; se ela não existe, o Supabase responde 404 NOT_FOUND.
    edgeFunction: async (f) => {
      const res = await fetch(`${url}/functions/v1/${f}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (res.status === 404) return false;
      if (res.status === 401) return true;
      return `resposta inesperada ${res.status}`;
    },
  };
}

async function main() {
  const project = await projectOfSite(SITE);
  console.log(`Supabase de ${SITE}: ${project.url}\n`);
  if (environmentOf(project.url) !== "production") {
    console.log("✗ Esse projeto não está em PRODUCTION_PROJECT_REFS (src/lib/environment.ts): o site publicado");
    console.log("  se comporta como desenvolvimento (selo Dev e demonstração). Acerte o ref ou as variáveis da Vercel.\n");
    process.exitCode = 1;
  }
  const ask = probes(project);
  const { tables, columns, buckets } = expectedFromMigrations();
  const checks = [
    ...[...tables].map(([t, file]) => ({ kind: "tabela", name: t, file, run: () => ask.table(t) })),
    ...[...columns].map(([c, file]) => ({ kind: "coluna", name: c, file, run: () => ask.column(c) })),
    ...[...buckets].map(([b, file]) => ({ kind: "bucket", name: b, file, run: () => ask.bucket(b) })),
    ...edgeFunctions().map((f) => ({ kind: "Edge Function", name: f, file: `supabase/functions/${f}/index.ts`, run: () => ask.edgeFunction(f) })),
  ];
  const results = await Promise.all(checks.map(async (c) => ({ ...c, ok: await c.run() })));

  const missing = results.filter((r) => r.ok === false);
  const odd = results.filter((r) => typeof r.ok === "string");
  for (const kind of ["tabela", "coluna", "bucket", "Edge Function"]) {
    const of = results.filter((r) => r.kind === kind);
    console.log(`${of.every((r) => r.ok === true) ? "✓" : "✗"} ${kind}s: ${of.filter((r) => r.ok === true).length} de ${of.length}`);
  }
  for (const r of missing) console.log(`\n✗ Falta ${r.kind} ${r.name} (vem de ${r.file})`);
  for (const r of odd) console.log(`\n? ${r.kind} ${r.name}: ${r.ok}`);
  if (missing.length) {
    const files = [...new Set(missing.filter((r) => r.kind !== "Edge Function").map((r) => r.file))];
    if (files.length) console.log(`\nRode no SQL Editor da produção, nesta ordem: ${files.join(", ")}.`);
    if (missing.some((r) => r.kind === "Edge Function")) console.log("Publique as Edge Functions que faltam (npm run gen:function e cole o index.ts no painel).");
  }
  if (!missing.length && !odd.length) console.log("\nProdução tem tudo o que o repositório espera.");
  process.exit(missing.length || odd.length ? 1 : (process.exitCode ?? 0));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
