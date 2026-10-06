# Backup e erros — design (fase 5 do piloto)

Data: 2026-10-06 · Aprovada.

**Atualização (2026-10-06): a parte de erros (Sentry, seção 4) saiu do escopo.** O Sentry é
bloqueado pela rede da Benner (site e ingestão), então os erros de quem usa o app no trabalho não
chegariam sem um túnel. Fica só o backup. O código do Sentry foi implementado e revertido na mesma
branch.

## Objetivo

Quando o piloto tiver dados reais da equipe:

1. conseguir recuperar o banco do prod se algo der errado (bug, exclusão sem querer, projeto
   perdido), com perda máxima de um dia;
2. saber quando o app quebra no navegador ou no desktop de alguém, com stack trace legível.

Tudo grátis: GitHub Actions (repositório público), Supabase Free, Sentry Developer.

**Sucesso:** existe um backup de ontem; um job prova todo dia que ele restaura num banco limpo;
um erro de JavaScript em produção chega no Sentry com o arquivo e a linha do código-fonte, sem
e-mail, nome ou query string.

## Decisões

| Pergunta | Escolha | Por quê |
|---|---|---|
| Anexos no backup? | Não, só o banco | Anexos do piloto eram de teste; perder só o Storage é raro |
| Onde guardar | Artifact do GitHub Actions, 90 dias | Nada novo para criar; a criptografia é o que protege |
| Erros | Sentry (plano Developer) | Agrupamento, source maps e aviso por e-mail prontos |

## 1. Backup diário — `.github/workflows/backup.yml`

- **Quando:** `schedule` diário às 06:00 UTC (03:00 de Brasília) e `workflow_dispatch`.
- **Ambiente:** `prod` (secret `SUPABASE_DB_URL`, o mesmo do Deploy do banco, URI do Session
  pooler).
- **O que entra:** só os dados dos schemas `public` e `auth`
  (`supabase db dump --data-only --use-copy --schema public,auth`). A estrutura (tabelas,
  RLS, funções, bucket) não entra: está nas migrations, idênticas ao prod desde o Deploy do
  banco. `storage` e `supabase_migrations` ficam de fora (o bucket e o registro saem das
  migrations; os arquivos não fazem parte do backup).
- **Manifesto:** `manifesto.txt` com a contagem de linhas de cada tabela de `public` e de
  `auth.users`, tirada na mesma execução, logo depois do dump.
- **Criptografia:** `age`, chave assimétrica. A chave **pública** fica escrita no workflow (só
  tranca). A **privada** fica no gerenciador de senhas do usuário e no secret
  `BACKUP_AGE_KEY` do ambiente `prod`. O par é gerado localmente, gravado direto no secret e num
  arquivo do usuário, sem passar pelo chat.
- **Saída:** `tododay-prod-AAAA-MM-DD.tar.age` (dados + manifesto) como artifact,
  `retention-days: 90`.

## 2. Teste de restauração — job `restaurar` no mesmo workflow

Roda depois de cada backup (`needs: backup`), em ~3 minutos:

1. baixa o artifact e descriptografa com `BACKUP_AGE_KEY`;
2. `supabase db start` (Postgres descartável com todas as migrations do repositório, como o job
   `Banco` do CI);
3. carrega os dados com `session_replication_role = replica`, para os triggers (atividade,
   histórico de status, `board_id` desnormalizado) não rodarem de novo e duplicarem linhas;
4. compara a contagem de cada tabela com o manifesto.

Falha se o arquivo não descriptografar, se o carregamento der erro, ou se alguma contagem não
bater. A falha (deste job ou do backup) vira o e-mail padrão do GitHub para quem mexeu por último
no `schedule`: é o aviso.

## 3. Recuperação de verdade — `docs/BACKUP.md`

Passo a passo curto, sempre manual (nenhum script restaura no prod sozinho):

1. baixar o artifact do dia escolhido (Actions → Backup do banco → execução → Artifacts);
2. descriptografar com a chave privada (`age -d -i chave.txt`);
3. **dados perdidos, projeto vivo:** apagar os dados (sem apagar o schema) e carregar o backup;
   **projeto perdido:** projeto novo, `supabase/setup_producao.sql`, carregar o backup, trocar o
   ref em `src/lib/environment.ts` e as variáveis da Vercel;
4. conferir com o manifesto e com `npm run check:prod`.

## 4. Erros no app — `@sentry/react`

- **Liga só com `VITE_SENTRY_DSN`:** definida na Vercel (Production) e no `.env.desktop`. Sem
  ela (o `npm run dev` local), o Sentry não inicializa.
- **Captura:**
  - erros não tratados e promessas rejeitadas (padrão do SDK);
  - erros de renderização: um `ErrorBoundary` na raiz (`main.tsx`) com tela "Algo deu errado"
    e botão Recarregar, nos tokens de cor do app. O `DashboardErrorBoundary` continua igual
    dentro dele;
  - erros do Supabase nas queries e mutations do React Query (`QueryCache` / `MutationCache`
    `onError`), exceto falhas de rede (`TypeError: Failed to fetch` e afins, e
    `navigator.onLine === false`). O toast que já existe continua igual.
- **Contexto de cada erro:** `environment` (`production` ou `development`, pelo
  `isProduction`), `release` (SHA do commit, de `VERCEL_GIT_COMMIT_SHA` no build; `local` se não
  houver), tag `plataforma` (`web` ou `desktop`), usuário só pelo `id` (uuid).
- **Privacidade:** `sendDefaultPii: false`, sem Session Replay, sem tracing
  (`tracesSampleRate` não definido). Um `beforeSend` / `beforeBreadcrumb` tira a query string e
  o fragmento de toda URL (do evento, da request e dos breadcrumbs de navegação e fetch), porque
  `?responsavel=ana` tem nome de gente. Essa limpeza é uma função pura em
  `src/lib/sentryScrub.ts`, com teste em `src/lib/sentryScrub.test.ts`.
- **Source maps:** `@sentry/vite-plugin` no `vite.config.ts`, ativo só quando existe
  `SENTRY_AUTH_TOKEN` (variável da Vercel, nunca no app). Envia os mapas e apaga os `.map` do
  `dist` depois (`filesToDeleteAfterUpload`), para não ficarem públicos. Sem o token, o build
  segue normal.
- **CSP (`vercel.json`):** `connect-src` ganha o host de ingestão do DSN escolhido
  (`https://*.ingest.us.sentry.io` ou `https://*.ingest.de.sentry.io`, conforme a região da
  conta). O `npm run test:e2e:csp` continua passando. O desktop não tem CSP (`csp: null`).
- **Aviso:** o e-mail de "novo problema" padrão do Sentry.

## Passos do usuário (com clique a clique na hora)

1. Criar a conta Sentry (plano Developer) e um projeto React; passar o DSN (é público).
2. Criar um token de organização com escopo de upload de source maps.
3. Na Vercel (Production): `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
4. Guardar a chave privada do `age` no gerenciador de senhas.

## Testes e verificação

- Vitest: `sentryScrub.test.ts` (URLs com query, fragmento, breadcrumbs, evento sem URL).
- CI: lint, testes e build passam com e sem `VITE_SENTRY_DSN`.
- `npm run test:e2e:csp` passa com o novo `connect-src`.
- Backup: rodar o workflow à mão uma vez (o usuário dispara, é prod) e ver os dois jobs verdes,
  com as contagens do manifesto no log do `restaurar`.
- Sentry: depois do deploy, provocar um erro de teste em produção e conferir no Sentry o stack
  trace mapeado, o `release`, o `environment` e a ausência de e-mail, IP e query string.

## Fora de escopo

- Anexos (arquivos do bucket) no backup; backup do dev; retenção acima de 90 dias; cópia fora
  do GitHub.
- Erros das Edge Functions (ficam nos logs do Supabase), desempenho/tracing, replay, painel de
  erros dentro do app.
