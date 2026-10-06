# Backup e erros (fase 5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** backup diário criptografado dos dados do prod com teste de restauração automático, e erros do app chegando no Sentry sem dados pessoais.

**Architecture:** um workflow agendado (`backup.yml`) com dois jobs: `backup` (dump só de dados de `public` + `auth`, manifesto de contagens, `age`, artifact de 90 dias) e `restaurar` (Postgres descartável com as migrations, carrega os dados com triggers desligados, compara contagens). No app, `@sentry/react` inicializado só com `VITE_SENTRY_DSN`, com uma função pura de limpeza de URLs, `ErrorBoundary` na raiz e captura dos erros do React Query; source maps enviados no build da Vercel e apagados do `dist`.

**Tech Stack:** GitHub Actions, Supabase CLI (`db dump`, `db start`), `age`, Node 24 + `pg`, React 18 + Vite 5, `@sentry/react`, `@sentry/vite-plugin`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-backup-e-erros-design.md`

> **Atualização (2026-10-06):** as Tasks 5–8 (Sentry) foram feitas e revertidas: o Sentry é bloqueado na rede da Benner e o usuário tirou a parte de erros do escopo. Valem as Tasks 1–4 e 9 (sem os passos do Sentry).

## Global Constraints

- Tudo grátis: GitHub Actions em repositório público, Supabase Free, Sentry Developer.
- Backup só do **prod**, só **dados** de `public` e `auth`; `storage` e `supabase_migrations` fora.
- Artifact `tododay-prod-AAAA-MM-DD.tar.age`, `retention-days: 90`.
- Agenda: `cron: "0 6 * * *"` (03:00 de Brasília) + `workflow_dispatch`.
- Chave privada do `age` só no secret `BACKUP_AGE_KEY` (ambiente `prod`) e com o usuário. Nunca no chat, no log ou no repositório. A pública fica no workflow.
- Nenhum script restaura no prod. Scripts que escrevem recusam URLs `supabase.co`/`supabase.com` (como `scripts/test-db.mjs`).
- Sentry: `sendDefaultPii: false`, sem Replay, sem tracing; usuário só por `id`; query string e fragmento removidos de toda URL enviada.
- Sentry só inicializa com `VITE_SENTRY_DSN`; o build passa sem nenhuma variável do Sentry.
- `.map` nunca publicado no `dist` quando o upload roda.
- Cores só pelos tokens do Tailwind; botão principal com `.btn-primary`; textos da UI em PT.
- Commits pequenos, em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Disparar o workflow no prod e fazer merge são ações do usuário (o modo automático bloqueia).

## Review Focus

1. **Escrita no prod entre o dump e a contagem** → o manifesto não bate com o dump e o `restaurar` acusa falha falsa. Esperado: contagem e dump na mesma foto. Coberto na Task 2: o manifesto sai do próprio arquivo de dados (contando linhas dos `INSERT`s por tabela), não de uma segunda consulta ao banco.
2. **Tabelas internas do `auth` que já existem no Postgres local** (`auth.schema_migrations`, `auth.instances`…) → o `restaurar` falha com chave duplicada. Esperado: só os dados do usuário entram. Coberto na Task 2 (ensaio local que lista as tabelas do dump e define os `-x`).
3. **Erro do Supabase sem `message` padrão ou objeto que não é `Error`** (PostgrestError é objeto simples) → o Sentry recebe "Non-Error exception" sem contexto, ou o filtro de rede quebra. Esperado: vira um `Error` com a mensagem e o `code`. Coberto na Task 5 (`toError`).
4. **URL relativa, malformada ou sem query** nos breadcrumbs → a limpeza lança e o evento some. Esperado: devolve a string sem `?…`/`#…`, nunca lança. Coberto na Task 5.
5. **Build da Vercel sem `SENTRY_AUTH_TOKEN`** (preview, fork) → build quebra. Esperado: build normal sem upload. Coberto na Task 7 (build no CI sem as variáveis).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/backupManifest.ts` | `countRows`, `formatManifest`, `diffManifest` (puras, testadas no Vitest, que só olha `src/**/*.test.ts`) |
| `src/lib/backupManifest.test.ts` | Testes do manifesto |
| `scripts/backup-dados.mjs` | CLI: `node scripts/backup-dados.mjs contar dados.sql` imprime o manifesto |
| `scripts/backup-restaurar.mjs` | Carrega `dados.sql` num Postgres **local**, com triggers desligados, e compara com o manifesto |
| `.github/workflows/backup.yml` | Jobs `backup` e `restaurar` |
| `docs/BACKUP.md` | Como recuperar de verdade e onde ficam as chaves |
| `src/lib/sentryScrub.ts` | `stripQuery`, `scrubEvent`, `scrubBreadcrumb`, `isNetworkError`, `toError` (puras) |
| `src/lib/sentryScrub.test.ts` | Testes das funções acima |
| `src/sentry.ts` | `initSentry()`, `reportError(e)`, `setSentryUser(id)`; no-op sem DSN |
| `src/components/ui/AppErrorBoundary.tsx` | Fallback "Algo deu errado" na raiz |
| `src/main.tsx` | Chama `initSentry`, monta `QueryCache`/`MutationCache` com `onError`, envolve tudo no `AppErrorBoundary` |
| `src/App.tsx` | `setSentryUser(userId)` |
| `vite.config.ts` | `__APP_RELEASE__`, `@sentry/vite-plugin` condicional, `sourcemap: "hidden"` só com token |
| `src/vite-env.d.ts` | `VITE_SENTRY_DSN?`, `__APP_RELEASE__` |
| `vercel.json` | `connect-src` com o host de ingestão |
| `.env.desktop.example`, `.env.example` | Linha `VITE_SENTRY_DSN=` comentada |
| `CLAUDE.md`, `docs/SEGURANCA.md` | Uma linha cada sobre backup e Sentry |

Os scripts `.mjs` importam `../src/lib/backupManifest.ts` direto (Node 24 executa `.ts` com type stripping); a Task 2 Step 1 confirma.

---

### Task 1: Chaves do `age` e secret `BACKUP_AGE_KEY`

**Files:** nenhum no repositório (a chave pública entra no workflow na Task 3).

**Interfaces:**
- Produces: chave pública `age1…` (anotada para a Task 3); secret `BACKUP_AGE_KEY` no ambiente `prod`; arquivo `%USERPROFILE%\Desktop\tododay-backup-chave.txt` para o usuário guardar e apagar.

- [ ] **Step 1: Instalar o `age`**

Run: `scoop install age` (PowerShell). Expected: `age --version` e `age-keygen --version` respondem.

- [ ] **Step 2: Gerar o par sem mostrar a privada**

```bash
age-keygen -o "$USERPROFILE/Desktop/tododay-backup-chave.txt" 2>&1 | grep -o 'age1[0-9a-z]*'
```
Expected: só a linha pública `age1…` na saída. Anote-a.

- [ ] **Step 3: Gravar o secret direto do arquivo**

```bash
gh secret set BACKUP_AGE_KEY --env prod < "$USERPROFILE/Desktop/tododay-backup-chave.txt"
gh secret list --env prod
```
Expected: `BACKUP_AGE_KEY` listado com a data de hoje.

- [ ] **Step 4: Testar o par localmente**

```bash
echo ok | age -r age1SUA_PUBLICA | age -d -i "$USERPROFILE/Desktop/tododay-backup-chave.txt"
```
Expected: `ok`.

- [ ] **Step 5: Pedir ao usuário**

Guardar o conteúdo de `Desktop\tododay-backup-chave.txt` no gerenciador de senhas (item "Tododay — chave do backup") e apagar o arquivo. Sem commit nesta task.

---

### Task 2: Manifesto e restauração (scripts + ensaio local contra o dev)

**Files:**
- Create: `src/lib/backupManifest.ts`, `src/lib/backupManifest.test.ts`, `scripts/backup-dados.mjs`, `scripts/backup-restaurar.mjs`

**Interfaces:**
- Produces:
  - `countRows(sql: string): Map<string, number>` — chave `schema.tabela`, conta linhas de `INSERT INTO "schema"."tabela" … VALUES (…)` (uma linha por `INSERT`, formato do `supabase db dump --data-only` sem `--use-copy`; o Step 1 confirma o formato).
  - `formatManifest(counts: Map<string, number>): string` — linhas `schema.tabela<TAB>n`, ordenadas, terminando em `\n`.
  - `diffManifest(expected: string, actual: Map<string, number>): string[]` — mensagens `public.card: esperado 10, restaurado 9`; vazio = igual.
  - CLI `node scripts/backup-dados.mjs contar <dados.sql>` → imprime o manifesto.
  - CLI `DATABASE_URL=… node scripts/backup-restaurar.mjs <dados.sql> <manifesto.txt>` → exit 0 se bater.

- [ ] **Step 1: Ensaiar o dump contra o dev e olhar o formato**

Dump só de leitura do **dev** (`aakske…`), num diretório temporário fora do repo:

```bash
cd "$SCRATCH" && supabase db dump --db-url "$(grep ^SUPABASE_DB_URL= C:/Users/pedro.romeiro/Desktop/projeto/.env | cut -d= -f2-)" --data-only --schema public,auth -f dados.sql
grep -oE '^INSERT INTO "[a-z_]+"\."[a-z_]+"' dados.sql | sort | uniq -c
grep -m3 '^INSERT' dados.sql | cut -c1-120
```
Expected: uma linha por `INSERT`; anote quais tabelas do `auth` aparecem. Confirme também que `node -e "import('./src/lib/position.ts').then(m=>console.log(Object.keys(m)))"` funciona na raiz do repo (type stripping do Node 24). Se não funcionar, a lógica vai para `scripts/backup-manifest.mjs` com JSDoc e o teste importa de lá.

- [ ] **Step 2: Escrever os testes que falham**

`src/lib/backupManifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countRows, diffManifest, formatManifest } from "./backupManifest";

const dump = [
  "SET session_replication_role = replica;",
  'INSERT INTO "auth"."users" ("id", "email") VALUES (\'a\', \'x@y\');',
  'INSERT INTO "public"."card" ("id", "title") VALUES (1, \'VALUES (2); INSERT INTO "public"."card"\');',
  'INSERT INTO "public"."card" ("id", "title") VALUES (2, \'b\');',
  'INSERT INTO "public"."team" ("id", "name") VALUES (1, \'t\');',
  "SELECT pg_catalog.setval('public.card_id_seq', 2, true);",
].join("\n");

describe("manifesto do backup", () => {
  it("conta uma linha por INSERT, por tabela, mesmo com texto parecido dentro do valor", () => {
    expect(countRows(dump)).toEqual(new Map([["auth.users", 1], ["public.card", 2], ["public.team", 1]]));
  });

  it("formata ordenado, uma tabela por linha", () => {
    expect(formatManifest(countRows(dump))).toBe("auth.users\t1\npublic.card\t2\npublic.team\t1\n");
  });

  it("aponta diferenças e tabelas que sumiram ou apareceram", () => {
    const expected = "auth.users\t1\npublic.card\t2\npublic.team\t1\n";
    expect(diffManifest(expected, countRows(dump))).toEqual([]);
    expect(diffManifest(expected, new Map([["public.card", 1], ["public.label", 3]]))).toEqual([
      "auth.users: esperado 1, restaurado 0",
      "public.card: esperado 2, restaurado 1",
      "public.label: esperado 0, restaurado 3",
      "public.team: esperado 1, restaurado 0",
    ]);
  });

  it("dump sem dados vira manifesto vazio, e manifesto vazio é falha (nada a conferir)", () => {
    expect(formatManifest(countRows("SET x = 1;\n"))).toBe("");
    expect(diffManifest("", new Map())).toEqual(["manifesto vazio: o backup não tem dados"]);
  });
});
```

Ajuste o formato da linha `INSERT` aos exemplos reais do Step 1 se forem diferentes (por exemplo sem aspas no nome).

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run src/lib/backupManifest.test.ts`. Expected: FAIL (módulo não existe).

- [ ] **Step 4: Implementar**

`src/lib/backupManifest.ts`:

```ts
// Manifesto do backup diário (.github/workflows/backup.yml): quantas linhas de cada tabela o
// arquivo de dados tem. Sai do próprio arquivo, não de outra consulta, para ser a mesma foto.

/** Uma linha por INSERT no começo da linha (formato do `supabase db dump --data-only`). */
export function countRows(sql: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [, schema, table] of sql.matchAll(/^INSERT INTO "?([a-z_]+)"?\."?([a-z_]+)"?/gm)) {
    const key = `${schema}.${table}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function formatManifest(counts: Map<string, number>): string {
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([t, n]) => `${t}\t${n}\n`).join("");
}

export function diffManifest(expected: string, actual: Map<string, number>): string[] {
  const want = new Map(
    expected.split("\n").filter(Boolean).map((line) => {
      const [table, n] = line.split("\t");
      return [table, Number(n)] as const;
    }),
  );
  if (want.size === 0) return ["manifesto vazio: o backup não tem dados"];
  const tables = [...new Set([...want.keys(), ...actual.keys()])].sort();
  return tables
    .filter((t) => (want.get(t) ?? 0) !== (actual.get(t) ?? 0))
    .map((t) => `${t}: esperado ${want.get(t) ?? 0}, restaurado ${actual.get(t) ?? 0}`);
}
```

Se o Step 1 mostrou `INSERT` multi-linha por linha de dado (vários `VALUES` num `INSERT`), troque a contagem para o que o formato real exige e acrescente um caso ao teste.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/lib/backupManifest.test.ts`. Expected: 4 passed.

- [ ] **Step 6: Scripts**

`scripts/backup-dados.mjs`:

```js
// Manifesto do backup: `node scripts/backup-dados.mjs contar dados.sql` imprime "schema.tabela<TAB>n".
import { readFileSync } from "node:fs";
import { countRows, formatManifest } from "../src/lib/backupManifest.ts";

const [cmd, file] = process.argv.slice(2);
if (cmd !== "contar" || !file) throw new Error("Uso: node scripts/backup-dados.mjs contar <dados.sql>");
process.stdout.write(formatManifest(countRows(readFileSync(file, "utf8"))));
```

`scripts/backup-restaurar.mjs`:

```js
// Teste de restauração do backup diário: carrega o arquivo de dados num Postgres DESCARTÁVEL (o do
// `supabase db start`, já com as migrations) e confere a contagem de cada tabela com o manifesto.
// Os triggers ficam desligados (session_replication_role = replica): sem isso, carregar os cards
// geraria de novo atividade e histórico de status.
//
// Uso: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
//        node scripts/backup-restaurar.mjs dados.sql manifesto.txt
// Nunca aponte para o dev ou o prod. Recuperar o prod de verdade é manual (docs/BACKUP.md).
import { readFileSync } from "node:fs";
import pg from "pg";
import { countRows, diffManifest } from "../src/lib/backupManifest.ts";

const [dataFile, manifestFile] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!dataFile || !manifestFile || !url) throw new Error("Uso: DATABASE_URL=… node scripts/backup-restaurar.mjs <dados.sql> <manifesto.txt>");
if (/supabase\.(co|com)/.test(url)) throw new Error("DATABASE_URL aponta para um projeto do Supabase; a restauração de teste só roda no banco local.");

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query("begin");
await client.query("set local session_replication_role = replica");
await client.query(readFileSync(dataFile, "utf8"));
await client.query("commit");

const restored = new Map();
for (const table of countRows(readFileSync(dataFile, "utf8")).keys()) {
  const [schema, name] = table.split(".");
  const { rows } = await client.query(`select count(*)::int as n from ${client.escapeIdentifier(schema)}.${client.escapeIdentifier(name)}`);
  restored.set(table, rows[0].n);
}
await client.end();

const problems = diffManifest(readFileSync(manifestFile, "utf8"), restored);
for (const [table, n] of [...restored].sort()) console.log(`${table}\t${n}`);
console.log(problems.length ? `\n✗ restauração não bate:\n  ${problems.join("\n  ")}` : "\n✓ restauração confere com o manifesto");
process.exit(problems.length ? 1 : 0);
```

Nota: `restored` conta as tabelas do **arquivo**; uma tabela que o manifesto lista e o arquivo não tem aparece como "restaurado 0" pelo `diffManifest`. A contagem no banco local inclui linhas que as migrations já criam (nenhuma tabela de `public` tem seed; se o Step 7 mostrar alguma, exclua essa tabela no dump com `-x`).

- [ ] **Step 7: Ensaio completo local (Docker Desktop)**

```bash
cd C:/Users/pedro.romeiro/Desktop/projeto && supabase db start
node scripts/backup-dados.mjs contar "$SCRATCH/dados.sql" > "$SCRATCH/manifesto.txt" && cat "$SCRATCH/manifesto.txt"
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/backup-restaurar.mjs "$SCRATCH/dados.sql" "$SCRATCH/manifesto.txt"
```
Expected: `✓ restauração confere com o manifesto`. Se falhar com chave duplicada numa tabela do `auth` (ex.: `auth.schema_migrations`), refaça o dump do Step 1 com `-x auth.schema_migrations` (e o que mais aparecer) até passar; anote a lista final de `-x` para a Task 3. Se o `supabase db start` local não aplicar as migrations, rode antes `DATABASE_URL=… node scripts/test-db.mjs` (aplica do zero). Depois: `supabase db stop --no-backup`, apagar `$SCRATCH/dados.sql`.

- [ ] **Step 8: Lint, testes, commit**

```bash
npm run lint && npm test
git add src/lib/backupManifest.ts src/lib/backupManifest.test.ts scripts/backup-dados.mjs scripts/backup-restaurar.mjs
git commit -m "Backup: manifesto de contagens e restauração de teste num banco local"
```

---

### Task 3: Workflow `backup.yml`

**Files:**
- Create: `.github/workflows/backup.yml`

**Interfaces:**
- Consumes: chave pública da Task 1; CLIs da Task 2; lista de `-x` da Task 2 Step 7; secrets `SUPABASE_DB_URL` e `BACKUP_AGE_KEY` do ambiente `prod`.

- [ ] **Step 1: Escrever o workflow**

```yaml
# Backup diário dos DADOS do prod (schemas public e auth), criptografado com age, guardado como
# artifact por 90 dias; logo depois, o job "restaurar" prova que ele carrega num banco limpo.
# A estrutura (tabelas, RLS, funções) vem das migrations. Recuperar de verdade: docs/BACKUP.md.
#
# Secrets do ambiente "prod": SUPABASE_DB_URL (Session pooler) e BACKUP_AGE_KEY (chave privada).
# A chave pública abaixo só tranca; a privada fica com o dono do projeto e no secret.
name: Backup do banco

on:
  schedule:
    - cron: "0 6 * * *" # 03:00 de Brasília
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: backup-banco
  cancel-in-progress: false

env:
  AGE_RECIPIENT: age1SUA_PUBLICA_DA_TASK_1

jobs:
  backup:
    name: Backup (tododay-prod)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: prod
    outputs:
      nome: ${{ steps.nome.outputs.nome }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Instala o age
        run: sudo apt-get update -qq && sudo apt-get install -y -qq age
      - id: nome
        run: echo "nome=tododay-prod-$(date -u +%F)" >> "$GITHUB_OUTPUT"
      - name: Dump dos dados
        run: supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --schema public,auth -x auth.schema_migrations -f dados.sql
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
      - name: Manifesto
        run: |
          node scripts/backup-dados.mjs contar dados.sql > manifesto.txt
          cat manifesto.txt
          test -s manifesto.txt || { echo "::error::Backup sem dados."; exit 1; }
      - name: Criptografa
        run: |
          tar -cf - dados.sql manifesto.txt | age -r "$AGE_RECIPIENT" -o "${{ steps.nome.outputs.nome }}.tar.age"
          rm dados.sql
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ steps.nome.outputs.nome }}
          path: ${{ steps.nome.outputs.nome }}.tar.age
          retention-days: 90
          if-no-files-found: error

  restaurar:
    name: Teste de restauração
    needs: backup
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: prod
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: Instala o age
        run: sudo apt-get update -qq && sudo apt-get install -y -qq age
      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.backup.outputs.nome }}
      - name: Descriptografa
        run: |
          printf '%s\n' "$BACKUP_AGE_KEY" > "$RUNNER_TEMP/chave.txt"
          age -d -i "$RUNNER_TEMP/chave.txt" "${{ needs.backup.outputs.nome }}.tar.age" | tar -xf -
          rm "$RUNNER_TEMP/chave.txt"
        env:
          BACKUP_AGE_KEY: ${{ secrets.BACKUP_AGE_KEY }}
      - name: Sobe o Postgres local
        run: supabase db start
      - name: Migrations do zero
        run: node scripts/test-db.mjs
        env:
          DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      - name: Carrega e confere
        run: node scripts/backup-restaurar.mjs dados.sql manifesto.txt
        env:
          DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Troque `age1SUA_PUBLICA_DA_TASK_1` pela chave real e a linha `-x` pela lista final da Task 2 Step 7 (um `-x schema.tabela` por item). O passo "Migrations do zero" usa o `test-db.mjs`, que aplica as migrations e roda os testes SQL num banco descartável; os testes SQL desfazem tudo, então o banco segue vazio para o carregamento. Se o Step 7 da Task 2 mostrou que o `supabase db start` já aplica as migrations, mantenha mesmo assim: o script só aplica se `public.team` não existir.

- [ ] **Step 2: Validar a sintaxe**

Run: `npx --yes js-yaml .github/workflows/backup.yml > /dev/null`. Expected: sem erro. (A validação do GitHub em si só aparece no push: `gh workflow view backup.yml` depois do merge.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/backup.yml
git commit -m "Backup diário do prod com teste de restauração"
```

A execução real só acontece depois do merge (Task 9): `workflow_dispatch` precisa do arquivo no `master`.

---

### Task 4: `docs/BACKUP.md` e referências

**Files:**
- Create: `docs/BACKUP.md`
- Modify: `docs/SEGURANCA.md:30` (item 8), `CLAUDE.md` (seção Ambientes)

- [ ] **Step 1: Escrever `docs/BACKUP.md`**

```markdown
# Backup do banco

Todo dia às 03:00 (Brasília) o workflow **Backup do banco** (`.github/workflows/backup.yml`) salva
os **dados** do prod (`tododay-prod`, schemas `public` e `auth`) criptografados com `age`, como
artifact da execução, por 90 dias. Logo depois, o job **Teste de restauração** carrega o backup num
Postgres descartável com as migrations e confere a contagem de cada tabela. Se algo falhar, o
GitHub manda e-mail.

Não entram: a estrutura (vem de `supabase/migrations/`), os arquivos dos anexos (bucket
`attachments`) e o dev.

## Chaves

- Pública: no topo do workflow (`AGE_RECIPIENT`). Só tranca.
- Privada: no gerenciador de senhas ("Tododay — chave do backup") e no secret `BACKUP_AGE_KEY`
  do ambiente `prod`. Sem ela, nenhum backup abre. Perdeu? Gere outro par (`age-keygen`), troque
  o secret e a pública; os backups antigos ficam ilegíveis.

## Recuperar

1. **Actions → Backup do banco →** a execução do dia escolhido **→ Artifacts**: baixe
   `tododay-prod-AAAA-MM-DD` e extraia o `.tar.age` do zip.
2. Descriptografe: `age -d -i chave.txt tododay-prod-AAAA-MM-DD.tar.age | tar -xf -` (sai
   `dados.sql` e `manifesto.txt`).
3. Teste antes no banco local: `supabase db start`, depois
   `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/test-db.mjs`
   e `node scripts/backup-restaurar.mjs dados.sql manifesto.txt` com o mesmo `DATABASE_URL`.
4. No prod, à mão e com a equipe avisada:
   - **Projeto vivo, dados errados:** no SQL Editor, `truncate` das tabelas de `public` e
     `delete from auth.users` (sem apagar o schema); depois carregue `dados.sql` com
     `psql "<URI do Session pooler>" -c "set session_replication_role = replica" -f dados.sql`
     (numa transação: `psql -1`).
   - **Projeto perdido:** crie um projeto novo, rode `supabase/setup_producao.sql`, carregue o
     `dados.sql` como acima, troque o ref em `src/lib/environment.ts`, as variáveis da Vercel e os
     secrets do GitHub, e republique as Edge Functions (Deploy do banco).
5. Confira: `manifesto.txt` × contagens no SQL Editor, e `npm run check:prod`.
```

- [ ] **Step 2: Atualizar `docs/SEGURANCA.md` item 8**

Troque "Ver o backup no LANCAMENTO.md." por "Backup diário criptografado pelo GitHub Actions, com teste de restauração: `docs/BACKUP.md`."

- [ ] **Step 3: Atualizar `CLAUDE.md`, seção "Ambientes"** — acrescente um item:

```markdown
- Backup: `.github/workflows/backup.yml` salva todo dia os dados do prod (criptografados com `age`, artifact de 90 dias) e testa a restauração num Postgres descartável. Recuperar: `docs/BACKUP.md`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/BACKUP.md docs/SEGURANCA.md CLAUDE.md
git commit -m "Como recuperar o banco a partir do backup"
```

---

### Task 5: Limpeza dos eventos do Sentry (funções puras)

**Files:**
- Create: `src/lib/sentryScrub.ts`, `src/lib/sentryScrub.test.ts`

**Interfaces:**
- Produces (todas sem dependência do SDK — tipos estruturais mínimos):
  - `stripQuery(url: string): string`
  - `scrubEvent<E extends ScrubbableEvent>(event: E): E`
  - `scrubBreadcrumb<B extends ScrubbableBreadcrumb>(crumb: B): B`
  - `isNetworkError(error: unknown, online?: boolean): boolean`
  - `toError(error: unknown): Error`

- [ ] **Step 1: Testes que falham**

`src/lib/sentryScrub.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isNetworkError, scrubBreadcrumb, scrubEvent, stripQuery, toError } from "./sentryScrub";

describe("stripQuery", () => {
  it("tira query string e fragmento de URLs absolutas e relativas", () => {
    expect(stripQuery("https://tododay-nu.vercel.app/?responsavel=ana&atrasadas=1#x")).toBe("https://tododay-nu.vercel.app/");
    expect(stripQuery("/rest/v1/card?select=*&assignee_id=eq.123")).toBe("/rest/v1/card");
    expect(stripQuery("/board#card-3")).toBe("/board");
  });

  it("não mexe no que não tem query e nunca lança", () => {
    expect(stripQuery("https://x.supabase.co/rest/v1/card")).toBe("https://x.supabase.co/rest/v1/card");
    expect(stripQuery("")).toBe("");
    expect(stripQuery("::não é url?a=1")).toBe("::não é url");
  });
});

describe("scrubEvent", () => {
  it("limpa a URL da request, o Referer e a query_string", () => {
    const event = scrubEvent({
      request: {
        url: "https://app/?pessoa=Ana%20Souza",
        query_string: "pessoa=Ana%20Souza",
        headers: { Referer: "https://app/?origem=dashboard", "User-Agent": "UA" },
      },
      user: { id: "u1", email: "a@b", ip_address: "1.2.3.4" },
    });
    expect(event.request).toEqual({ url: "https://app/", headers: { Referer: "https://app/", "User-Agent": "UA" } });
    expect(event.user).toEqual({ id: "u1" });
  });

  it("evento sem request nem user passa igual", () => {
    expect(scrubEvent({ message: "x" })).toEqual({ message: "x" });
  });
});

describe("scrubBreadcrumb", () => {
  it("limpa navegação (from/to) e fetch/xhr (url)", () => {
    expect(scrubBreadcrumb({ category: "navigation", data: { from: "/?a=1", to: "/b?c=2" } }).data).toEqual({ from: "/", to: "/b" });
    expect(scrubBreadcrumb({ category: "fetch", data: { url: "/rest/v1/x?id=eq.1", method: "GET" } }).data).toEqual({ url: "/rest/v1/x", method: "GET" });
  });

  it("breadcrumb sem data passa igual", () => {
    expect(scrubBreadcrumb({ category: "ui.click", message: "button" })).toEqual({ category: "ui.click", message: "button" });
  });
});

describe("isNetworkError", () => {
  it("reconhece falhas de rede dos navegadores", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkError({ message: "TypeError: Failed to fetch", code: "" })).toBe(true);
  });

  it("offline é sempre rede", () => {
    expect(isNetworkError(new Error("qualquer"), false)).toBe(true);
  });

  it("erro do banco não é rede", () => {
    expect(isNetworkError({ message: "new row violates row-level security policy", code: "42501" })).toBe(false);
    expect(isNetworkError(new Error("x is undefined"))).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe("toError", () => {
  it("devolve o próprio Error", () => {
    const e = new Error("x");
    expect(toError(e)).toBe(e);
  });

  it("transforma o erro do Supabase (objeto simples) num Error com code e details", () => {
    const e = toError({ message: "permission denied for table card", code: "42501", details: null, hint: null });
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("permission denied for table card (42501)");
    expect(e.name).toBe("SupabaseError");
  });

  it("qualquer outra coisa vira texto", () => {
    expect(toError("falhou").message).toBe("falhou");
    expect(toError(undefined).message).toBe("Erro desconhecido");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/sentryScrub.test.ts`. Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/lib/sentryScrub.ts`:

```ts
// O que vai para o Sentry (src/sentry.ts) passa por aqui. A query string do app tem nomes de
// pessoas (?responsavel=ana, ?pessoa=...) e a do Supabase tem ids e filtros: nenhuma URL sai com
// ?... ou #.... Usuário só pelo id. Sem dependência do SDK, para testar como função pura.

type Headers = Record<string, string>;
export type ScrubbableEvent = {
  request?: { url?: string; query_string?: unknown; headers?: Headers; [k: string]: unknown };
  user?: { id?: string | number; [k: string]: unknown };
  [k: string]: unknown;
};
export type ScrubbableBreadcrumb = { category?: string; data?: Record<string, unknown>; [k: string]: unknown };

export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const out = { ...event };
  if (out.request) {
    const { query_string: _q, ...request } = out.request;
    if (request.url) request.url = stripQuery(request.url);
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).map(([k, v]) => [k, /^referer$/i.test(k) ? stripQuery(v) : v]),
      );
    }
    out.request = request;
  }
  if (out.user) out.user = out.user.id === undefined ? {} : { id: out.user.id };
  return out;
}

export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(crumb: B): B {
  if (!crumb.data) return crumb;
  const data = { ...crumb.data };
  for (const key of ["url", "from", "to"]) {
    if (typeof data[key] === "string") data[key] = stripQuery(data[key] as string);
  }
  return { ...crumb, data };
}

const NETWORK = /failed to fetch|networkerror|load failed|network request failed|fetch failed/i;

/** Falha de rede (offline, conexão caiu): não é bug, não vai para o Sentry. */
export function isNetworkError(error: unknown, online: boolean = typeof navigator === "undefined" || navigator.onLine): boolean {
  if (!online) return true;
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  return NETWORK.test(message);
}

/** O Supabase lança objetos simples ({ message, code, details, hint }); o Sentry quer um Error. */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const code = "code" in error && error.code ? ` (${String(error.code)})` : "";
    const e = new Error(`${String(error.message)}${code}`);
    e.name = "SupabaseError";
    return e;
  }
  return new Error(error === undefined || error === null ? "Erro desconhecido" : String(error));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/sentryScrub.test.ts`. Expected: todos passam. Depois `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sentryScrub.ts src/lib/sentryScrub.test.ts
git commit -m "Sentry: limpeza de URLs e filtro de erros de rede (funções puras)"
```

---

### Task 6: Sentry no app

**Files:**
- Create: `src/sentry.ts`, `src/components/ui/AppErrorBoundary.tsx`
- Modify: `src/main.tsx`, `src/App.tsx:51-52`, `src/vite-env.d.ts`, `vite.config.ts` (só o `define`), `.env.example`, `.env.desktop.example`

**Interfaces:**
- Consumes: `scrubEvent`, `scrubBreadcrumb`, `isNetworkError`, `toError` (Task 5); `isProduction` de `src/db/supabase.ts`.
- Produces: `initSentry(): void`, `reportError(error: unknown): void`, `setSentryUser(id: string | null): void`; global `__APP_RELEASE__: string`.

- [ ] **Step 1: Instalar**

Run: `npm install @sentry/react`. Leia em `node_modules/@sentry/react/README.md` (ou `build/types/index.d.ts`) a assinatura atual de `init`, `ErrorBoundary`, `captureException`, `setUser`, `setTag` e confirme que `beforeSend`/`beforeBreadcrumb` existem com esses nomes; ajuste o código abaixo se a versão instalada mudar algo.

- [ ] **Step 2: `__APP_RELEASE__` e tipos**

Em `vite.config.ts`, no `define`:

```ts
      __APP_VERSION__: JSON.stringify(pkg.version),
      // Commit publicado (a Vercel define no build); "local" fora dela. Liga o erro do Sentry à versão.
      __APP_RELEASE__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA ?? "local"),
```

Em `src/vite-env.d.ts`, dentro de `ImportMetaEnv`:

```ts
  /** DSN do Sentry (público). Sem ele, o Sentry não liga (ver src/sentry.ts). */
  readonly VITE_SENTRY_DSN?: string;
```

e no fim:

```ts
// Commit publicado, injetado pelo vite.config.ts ("local" fora da Vercel).
declare const __APP_RELEASE__: string;
```

- [ ] **Step 3: `src/sentry.ts`**

```ts
// Erros do app no Sentry. Liga só com VITE_SENTRY_DSN (Vercel em produção e .env.desktop); sem ela
// tudo aqui é no-op. Nada de dado pessoal: sem IP, sem e-mail, sem replay, usuário só pelo id e
// URLs sem query string (lib/sentryScrub.ts).
import * as Sentry from "@sentry/react";
import { isProduction } from "./db/supabase";
import { isNetworkError, scrubBreadcrumb, scrubEvent, toError } from "./lib/sentryScrub";

const dsn = import.meta.env.VITE_SENTRY_DSN;

export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: isProduction ? "production" : "development",
    release: __APP_RELEASE__,
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
  Sentry.setTag("plataforma", "__TAURI_INTERNALS__" in window ? "desktop" : "web");
}

/** Erro que o app tratou (toast) mas que é bug: RLS negando, RPC falhando. Rede fica de fora. */
export function reportError(error: unknown): void {
  if (!dsn || isNetworkError(error)) return;
  Sentry.captureException(toError(error));
}

export function setSentryUser(id: string | null): void {
  if (dsn) Sentry.setUser(id ? { id } : null);
}
```

Se o TypeScript reclamar dos genéricos de `scrubEvent`/`scrubBreadcrumb` com os tipos do SDK, faça o cast no ponto de uso (`scrubEvent(event as ScrubbableEvent) as typeof event`), não afrouxe os tipos de `sentryScrub.ts`.

- [ ] **Step 4: `AppErrorBoundary`**

`src/components/ui/AppErrorBoundary.tsx`:

```tsx
import type { ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { EmptyState } from "./EmptyState";
import { IconColumns } from "./icons";

/** Último recurso: um erro de renderização em qualquer tela mostra isto em vez da página em branco. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={
        <div className="flex min-h-screen items-start justify-center bg-bg-base p-6">
          <EmptyState
            icon={<IconColumns size={22} />}
            title="Algo deu errado."
            description="O erro foi registrado. Recarregue a página para continuar."
            action={
              <button type="button" onClick={() => location.reload()} className="btn-primary px-4 py-2">
                Recarregar
              </button>
            }
          />
        </div>
      }
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
```

(`Sentry.ErrorBoundary` funciona mesmo sem `init`: só não envia.) Confira em `src/index.css`/`tailwind.config` que `bg-bg-base` é o nome real da classe do token `bg-base`; use o que o resto do app usa na tela de login (`grep -rn "bg-base" src/components/auth`).

- [ ] **Step 5: `main.tsx`**

```tsx
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppErrorBoundary } from "./components/ui/AppErrorBoundary";
import { initSentry, reportError } from "./sentry";
...
initSentry();

// Erros do Supabase nas queries e mutations viram toast nas telas; aqui também vão para o Sentry.
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportError }),
  mutationCache: new MutationCache({ onError: reportError }),
});
...
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        ...
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
```

`initSentry()` vem depois dos imports e antes do `createRoot`.

- [ ] **Step 6: usuário no `App.tsx`**

No começo de `App({ userId })`:

```tsx
  useEffect(() => setSentryUser(userId), [userId]);
```

com `import { setSentryUser } from "./sentry";` (e `useEffect` no import do React, se ainda não estiver). O logout desmonta o `App`; acrescente o retorno `() => setSentryUser(null)` no mesmo efeito.

- [ ] **Step 7: Exemplos de env**

Em `.env.example` e `.env.desktop.example`, no fim:

```
# Sentry (opcional): DSN do projeto, é público. Vazio = não envia erros.
VITE_SENTRY_DSN=
```

- [ ] **Step 8: Verificar**

```bash
npm run lint && npm test && npm run build
npm run test:e2e:mock
```
Expected: tudo verde, sem DSN (o Sentry fica desligado). Depois, com o DSN do usuário (Task 8) no `.env.local`: `npm run dev`, rodar no console do navegador `setTimeout(() => { throw new Error("teste sentry local") })` e ver o evento no Sentry com `environment=development`, sem query string.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/sentry.ts src/components/ui/AppErrorBoundary.tsx src/main.tsx src/App.tsx src/vite-env.d.ts vite.config.ts .env.example .env.desktop.example
git commit -m "Sentry no app: erros não tratados, telas e erros do Supabase, sem dados pessoais"
```

---

### Task 7: Source maps no build da Vercel

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `__APP_RELEASE__` (mesmo valor como `release.name`). Variáveis de build: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.

- [ ] **Step 1: Instalar**

Run: `npm install -D @sentry/vite-plugin`. Confira em `node_modules/@sentry/vite-plugin/README.md` os nomes `authToken`, `org`, `project`, `release.name`, `sourcemaps.filesToDeleteAfterUpload`.

- [ ] **Step 2: Plugin condicional**

Em `vite.config.ts`:

```ts
import { sentryVitePlugin } from "@sentry/vite-plugin";
...
const release = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
// Source maps vão para o Sentry só no build da Vercel com o token (nunca no app); depois do envio
// os .map são apagados do dist, para não ficarem públicos. Sem o token, build normal sem mapas.
const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN);
```

No `return`:

```ts
    plugins: [
      react(),
      sentryUpload &&
        sentryVitePlugin({
          authToken: process.env.SENTRY_AUTH_TOKEN,
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          release: { name: release },
          sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
          telemetry: false,
        }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_RELEASE__: JSON.stringify(release),
    },
    build: {
      sourcemap: sentryUpload ? "hidden" : false,
      ...
```

(`"hidden"` gera os mapas sem o comentário `//# sourceMappingURL` no JS.)

- [ ] **Step 3: Verificar sem token e sem mapas no dist**

```bash
npm run build && ls dist/assets | grep -c '\.map$' ; npm run lint
```
Expected: build ok, `0` arquivos `.map`. O CI (`Lint, testes e build`) roda sem nenhuma variável do Sentry, cobrindo o Review Focus 5.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vite.config.ts
git commit -m "Sentry: source maps enviados no build da Vercel e apagados do dist"
```

---

### Task 8: Conta Sentry, variáveis e CSP

**Files:**
- Modify: `vercel.json` (`connect-src`)

- [ ] **Step 1: Passos do usuário (clique a clique)**

1. sentry.io → Sign up (plano **Developer**, grátis). Região de dados: escolher US ou EU e anotar.
2. Create Project → plataforma **React** → nome `tododay` → copiar o **DSN** (`https://…@o….ingest.us.sentry.io/…`) e mandar no chat (é público).
3. Settings → Developer Settings → **Organization Tokens** → Create → copiar o token (secreto: só na Vercel).
4. Vercel → projeto `tododay` → Settings → Environment Variables, ambiente **Production**:
   `VITE_SENTRY_DSN` (o DSN), `SENTRY_AUTH_TOKEN` (o token), `SENTRY_ORG` (slug da organização, na URL do Sentry), `SENTRY_PROJECT` = `tododay`.
5. No `.env.desktop` local: `VITE_SENTRY_DSN=` com o mesmo DSN.

- [ ] **Step 2: CSP**

Em `vercel.json`, no `connect-src`, depois de `wss://*.supabase.co`, acrescente o host do DSN com curinga na organização: `https://*.ingest.us.sentry.io` (ou `https://*.ingest.de.sentry.io` se a conta for EU).

- [ ] **Step 3: Verificar**

```bash
npm test && npm run test:e2e:csp
```
Expected: `securityHeaders.test.ts` e o `csp.spec.ts` verdes.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "CSP libera o envio de erros ao Sentry"
```

---

### Task 9: PR, merge e verificação em produção

- [ ] **Step 1: PR**

```bash
git push -u origin fase5-backup-erros
gh pr create --base master --title "Fase 5: backup diário do prod e erros no Sentry" --body "…"
gh pr checks <n> --watch
```
Expected: "Lint, testes e build" e "Banco - migrations e testes SQL" verdes. O merge não dispara o Deploy do banco (não mexe em `supabase/`), então pode ser feito com `gh pr merge <n> --merge --delete-branch` (se o modo automático bloquear, o usuário roda com `!`).

- [ ] **Step 2: Primeiro backup (o usuário dispara, é prod)**

`! gh workflow run backup.yml` → acompanhar com `gh run watch`. Expected: `backup` e `restaurar` verdes; no log do `restaurar`, as contagens e `✓ restauração confere com o manifesto`; artifact `tododay-prod-2026-10-…` listado.

- [ ] **Step 3: Recuperação manual ensaiada**

Baixar o artifact (`gh run download <id>`), descriptografar com a chave do gerenciador de senhas (o usuário cola num arquivo temporário), e rodar o Step 3 do `docs/BACKUP.md` contra o banco local. Expected: confere. Apagar os arquivos baixados.

- [ ] **Step 4: Erro de teste em produção**

Depois do deploy da Vercel, o usuário abre `https://tododay-nu.vercel.app/?responsavel=teste`, faz login e roda no console `setTimeout(() => { throw new Error("teste sentry prod") })`. Conferir no Sentry: stack trace com nomes de arquivo `src/...` (mapeado), `release` = SHA do commit, `environment=production`, tag `plataforma=web`, usuário só com id, URL sem `?responsavel=…`, sem IP. Conferir também que `https://tododay-nu.vercel.app/assets/*.map` dá 404 (`curl -sI`).

- [ ] **Step 5: Memória e checklist**

Atualizar `pilot-launch.md` (fase 5 concluída; próximo: fase 6 ou checklist de lançamento).
