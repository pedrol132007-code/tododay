# CLAUDE.md

Tododay — kanban de equipe. React 18 + TypeScript + Vite + Tailwind + Supabase (Postgres + Auth + Realtime). Roda no navegador (deploy na Vercel) e como app desktop Tauri v2, que é só uma casca em volta do mesmo frontend — o Rust não tem lógica nem plugins.

Plano da migração para Supabase, com as decisões de produto: `docs/superpowers/plans/2026-09-23-migracao-supabase.md`.

## Convenções

- Todo acesso ao Supabase vive em `src/db/*.ts` (cliente em `src/db/supabase.ts`, com `must()` para desembrulhar `{ data, error }`). Nunca chame o Supabase de dentro de componentes React.
- `src/types/index.ts` é a única fonte de verdade dos tipos TS e espelha exatamente as colunas de `supabase/migrations/`. Ao mudar uma migration, atualize os tipos no mesmo commit.
- IDs são `bigint` no Postgres e `number` no TS; `profile.id` / `user_id` são `uuid` (`string`).
- Migrations são arquivos numerados sequenciais em `supabase/migrations/` (`0001_*.sql`, `0002_*.sql`, ...). Nunca edite uma migration já aplicada — crie uma nova. Ninguém cola migration à mão: no merge no `master`, o workflow `Deploy do banco` (`.github/workflows/deploy-banco.yml`, Supabase CLI) aplica no dev e depois no prod só as que faltam (a CLI registra o que já rodou em cada banco) e publica as Edge Functions de `supabase/functions/`. Para testar no dev antes do merge, ainda dá para colar no SQL Editor do dev; o deploy depois só registra.
- Toda migration nova de schema/RLS vem com um teste em `supabase/tests/NNNN_*_test.sql`: um bloco `DO` que sempre termina com erro para desfazer tudo (`PASSOU: ...` ou `FALHOU: ...`). O job `Banco` do CI sobe um Postgres descartável (`supabase db start`), aplica todas as migrations do zero e roda todos os testes e a auditoria (`scripts/test-db.mjs`): um teste antigo que a regra nova quebrar aparece ali.
- `supabase/setup_producao.sql` é gerado por `npm run gen:setup` (junção das migrations, para um projeto novo). Não edite à mão; regere ao criar uma migration (o CI confere).
- Permissões são por equipe (`team_role(team_id)`: `admin` / `member` / `viewer`) e garantidas por RLS no banco. A UI esconde controles de edição do `viewer`, mas quem protege é o RLS. A estrutura do board (colunas: criar, renomear, reordenar, tipo, WIP, excluir; boards: criar, renomear, excluir) é só do `admin` (`useIsAdmin`); membros mexem em cards, etiquetas, checklist e anexos. Desativar membro (`team_member.deactivated_at`, `0013`) tira o acesso sem apagar nada; remover (delete) desatribui os cards dele.
- Convites: o admin convida por e-mail na tela Equipe, pela Edge Function `members` (`supabase/functions/members/index.ts`, arquivo único, colado no painel com o nome `members`; cliente em `src/db/members.ts`). Ela cria a conta com `inviteUserByEmail` (a pessoa define a senha pelo link), põe na equipe e registra `member.invited` na atividade. "Gerar link de acesso" (link de recovery) só existe para quem nunca entrou, para um admin nunca entrar na conta de quem já usa o app. Em produção o cadastro público é fechado (no painel; a UI esconde "Criar conta" e "Criar equipe"). A primeira equipe e o primeiro admin saem de `npm run admin:primeiro`, que pede a service_role na hora e não grava nada; se o e-mail não chegar e o link do terminal vier cortado, `npm run admin:link` gera outro direto na área de transferência. Os links antigos (`team_invite`, `0006`) continuam aceitos, mas a UI não gera mais.
- Busca, filtros e ordenação do board ficam na query string (`?responsavel=ana&atrasadas=1&paradas=7&ordem=prazo`), lidos por `useBoardFilters` e aplicados pelas funções puras de `src/lib/boardFilters.ts`, as mesmas no board real e no de demonstração. `?coluna=andamento|abertas` filtra pelo tipo da coluna. Todo número do dashboard que é um conjunto de tarefas abertas hoje abre o board assim (quando o período termina hoje); o mapa número → filtro é só `src/lib/dashboardLinks.ts`, e `dashboardLinks.test.ts` confere que o board filtrado mostra o mesmo número. Entregas (do período inteiro) abrem a lista lateral, e cada tarefa dela abre no board (`?card=`). O link leva `?origem=` (a barra mostra de onde veio e "← Voltar ao dashboard"); o período e a pessoa do dashboard também ficam na URL (`?periodo=`, `?de=&ate=`, `?pessoa=`), para o Voltar reabrir como estava. Com filtro ou ordenação, arrastar fica desligado.
- Anexos (`0011_attachments.sql`): arquivo no bucket privado `attachments` em `<card_id>/<uuid>`, metadados em `card_attachment`, acesso só por URL assinada. Só a Edge Function `attachments` grava metadados, depois de conferir o conteúdo com `src/lib/attachmentRules.ts` (limite e tipos ficam só ali e no bucket). Apagar anexo (inclusive em cascata) põe o caminho em `attachment_trash`, e a mesma função esvazia a lixeira; arquivar não mexe nos anexos. Fonte da função: `supabase/functions/attachments/handler.ts`; o `index.ts` ao lado é gerado (`npm run gen:function`) para colar no painel e não se edita à mão.
- Mover cards/colunas usa RPCs no banco (`0004_moves_and_search.sql`), não updates soltos de `position`.
- Posições (`position`) são `double precision`. Inserir no fim: `MAX(position) + 1`. Reordenar entre dois itens: média dos vizinhos (`src/lib/position.ts`).
- Mudanças de outros usuários chegam via Realtime por board (`src/db/realtime.ts` → `useRealtimeSync`), que só invalida queries do React Query.
- Só a chave anon/publishable vai para o frontend (`VITE_SUPABASE_*`). A `service_role` nunca entra no app.
- O ambiente sai do projeto em `VITE_SUPABASE_URL` (`src/lib/environment.ts`, `PRODUCTION_PROJECT_REFS`), não de uma variável a mais. Use `isProduction` de `src/db/supabase.ts`. Em produção, a demonstração não existe (sem botão, sem gerador); fora dela, o `BrandMark` mostra o selo "Dev" e a aba diz "Tododay (dev)". O `e2e/seed.ts` recusa produção e o `check:prod` avisa se o site publicado não é um projeto de produção. Recriou o prod? Troque o ref ali.
- Visual segue a identidade da Benner (`docs/identidade-benner/`). Cores só pelos tokens semânticos do Tailwind (`primary`, `danger`, `success`, `highlight`, `on-accent`, `bg-base/surface/elevated/column/card`, `text-primary/muted`, `border`), que são variáveis CSS em `src/index.css` com versão clara (`:root`) e escura (`.dark`). Nunca use hex ou cores do Tailwind (`bg-blue-500`) direto em componentes. Azul = ação principal, vermelho = perigo/erro, laranja = hover/seleção, verde (`success`) = mudança boa no dashboard (sempre com seta e texto, nunca só cor).
- Botão de ação principal usa a classe `.btn-primary` (caixa alta, hover laranja); o componente só define padding/largura.
- Preferências da instalação (tema sistema/claro/escuro e densidade normal/compacta) vivem em `PreferencesProvider` (`src/hooks/usePreferences.tsx`), salvas no localStorage (`tododay.theme`, `tododay.density`) e editadas na tela Configurações. Colunas recolhidas também ficam no localStorage, por board (`tododay.collapsed.<boardId>`, `useCollapsedLists`): coluna recolhida não arrasta nem recebe cards. As boas-vindas do primeiro acesso (`WelcomeDialog`) também: `tododay.welcomed`. Não vão para o banco. Um script inline no `index.html` aplica a classe `dark` antes do React. Fonte: Montserrat (a da Benner, mundial, é licenciada pelo Adobe Fonts).
- Menu da pessoa (`AppMenu`): **Minhas tarefas** (cards atribuídos a ela, abertos, em todos os boards da equipe, agrupados por prazo em `src/lib/myTasks.ts`), Equipe, Configurações (com **Perfil**: nome e troca de senha; o nome é o único campo do `profile` que o cliente pode mudar) e Enviar feedback.
- Sem abstrações antecipadas — resolva o problema atual, não o hipotético.
- Dashboard (`src/components/dashboard/`, spec `docs/superpowers/specs/2026-09-28-dashboard-gestor-design.md`): `DashboardData` é uma lista de tarefas com histórico de status; as métricas são funções puras em `src/lib/metrics.ts` (períodos, percentil 85, backlog, no prazo) e os limites de risco ficam só em `src/lib/dashboardRules.ts`, junto com a direção boa de cada métrica e o limite de "estável" (`METRICS`, `MIN_CHANGE`). Toda variação passa pelo componente `Variation` (`src/lib/variation.ts`): a seta mostra só a direção do número, a cor diz se melhorou, o texto é fixo ("▲ +9 tarefas no período", "▼ −2 p.p. vs. período anterior") e a leitura em frase fica no tooltip; nenhum card formata variação por conta própria. Cada gráfico tem uma frase de resumo gerada por regras em `src/lib/chartSummaries.ts` (limites `SUMMARY_*` em `dashboardRules.ts`), sempre a partir dos pontos do próprio gráfico, para nunca citar outro período; sem nada relevante, frase neutra ou nenhuma. Hoje só `src/lib/demoData.ts` gera dados (demonstração em memória, pessoas fictícias, um perfil por pessoa para espalhar os problemas; `generateDemo` escolhe uma semente que mostre todos os cenários). A demonstração vive no `TeamWorkspace` (`App.tsx`) e é a mesma no Dashboard e no Board: enquanto existe, a aba Board mostra o board fictício (`src/lib/demoBoard.ts` → `DemoBoardView`, só leitura, com o `CardFace` do board real); escolher um board real sai dela. Parte dos cards da demonstração tem anexos de exemplo (`demoAttachments` em `demoBoard.ts`), desenhados no navegador (`src/lib/demoFiles.ts`, canvas e `demoPdf.ts`) como URLs `blob:`; nada vai para o Storage. Nunca invente valores para o que o modelo não tem. Gráficos são SVG próprios com as cores `chart-1` (azul Benner), `chart-2` (vermelho Benner), `chart-ref` (cinza, média da equipe) e `chart-hover` (laranja, só no hover) — o par azul+vermelho foi validado com a skill dataviz; não use outras cores em gráficos. Colunas usam o degradê `chart-1`→`chart-2` revelado pelo tamanho da barra; linhas e as barras da "Carga da equipe" ficam sólidas em `chart-1`. A Carga da equipe é ordenada por risco (atrasadas, depois carga) e nunca vira ranking: sem posição, medalha ou ordenação por entregas.

## Modelo de dados

Fonte autoritativa: `supabase/migrations/`. Resumo:

- `profile(id → auth.users, email, display_name, created_at)` — criado por trigger no cadastro
- `team(id, name, created_by, created_at)`
- `team_member(team_id, user_id, role, job_title, joined_at)`
- `team_invite(...)` — link de convite de uso único, aceito pela função `accept_invite()`
- `board(id, team_id, name, position, created_at)`
- `list(id, board_id, name, position, wip_limit)`
- `card(id, list_id, board_id, title, description, position, due_date, assignee_id, created_at, updated_at, archived_at)` — `board_id` desnormalizado por trigger (filtro do Realtime)
- `label(id, board_id, name, color)`, `card_label(card_id, label_id)`
- `checklist_item(id, card_id, text, done, position)`
- `activity(id, team_id, board_id, card_id, actor_id, actor_name, action, payload jsonb, created_at)` — preenchida por triggers; `payload` guarda os nomes da época

## Ambientes

- Dois projetos Supabase: `tododay-dev` (usado no `.env` local) e `tododay-prod` (variáveis na Vercel).
- `.env` precisa de `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (ver `.env.example`). Sem elas o app lança erro ao abrir.
- Antes de publicar, `npm run check:prod`: lê o Supabase que o site publicado usa (do JavaScript dele, só a chave pública) e confere se tem as tabelas, colunas e buckets das migrations e as Edge Functions de `supabase/functions/`. Já aconteceu de uma migration e uma função ficarem só no dev.
- Backup: `.github/workflows/backup.yml` salva todo dia os dados do prod (criptografados com `age`, artifact de 90 dias) e testa a restauração num Postgres descartável. Recuperar: `docs/BACKUP.md`.
- Web: `vercel.json` (SPA, tudo reescreve para `index.html`). Templates de e-mail em PT em `supabase/templates/`, colados no painel do Supabase.

## Como rodar em dev

Web (só precisa de Node):

```bash
npm install
npm run dev        # http://localhost:1420
npm test           # Vitest (só src/**/*.test.ts, funções puras)
npm run test:e2e   # Playwright (app.spec.ts usa o Supabase de DEV; layout e anexos simulam o Supabase com e2e/mockSession.ts)
npm run test:e2e:mock  # só os simulados (layout e anexos): sem banco, sem SUPABASE_DB_URL
```

Testes de ponta a ponta (`e2e/`): o `e2e/seed.ts` roda antes de cada execução e, conectando direto no Postgres de dev (`SUPABASE_DB_URL`), garante a conta `E2E_EMAIL`/`E2E_PASSWORD` confirmada, a "Equipe E2E" e um "Board E2E" vazio. Recusa rodar se `SUPABASE_DB_URL` e `VITE_SUPABASE_URL` forem projetos diferentes. Nunca aponte essas variáveis para produção.

Desktop — pré-requisitos (uma vez só):

1. [Node.js LTS](https://nodejs.org)
2. Rust via [rustup](https://rustup.rs)
3. Windows: WebView2 Runtime (já vem no Windows 11) + um linker C. Duas opções:
   - Microsoft C++ Build Tools (workload "Desktop development with C++", via Visual Studio Installer) — toolchain MSVC padrão do Rust no Windows.
   - **Sem admin/Visual Studio:** `scoop install mingw` e depois `rustup toolchain install stable-x86_64-pc-windows-gnu` + `rustup override set stable-x86_64-pc-windows-gnu` dentro de `src-tauri/`. Evita o instalador da Microsoft; usado neste ambiente de dev.

```bash
npm run tauri dev      # janela desktop com hot-reload
npm run tauri build    # instalador de teste (usa o .env de dev)
npm run desktop:build  # instalador para distribuir (usa o .env.desktop)
```

Se rodar `npm run tauri dev` de dentro do Git Bash, o `link.exe` do próprio Git (`usr/bin/link.exe`, uma ferramenta de hard link) pode sombrear o linker correto no PATH. Rode pelo PowerShell/cmd nesse caso, ou garanta que o PATH do MinGW/MSVC vem antes do Git no PATH.

O build desktop embute as variáveis no momento do build. `npm run desktop:build` roda o Vite em `--mode desktop`, que exige um `.env.desktop` (modelo em `.env.desktop.example`) com as chaves do `tododay-prod` e `VITE_PUBLIC_URL` — senão o build falha. `VITE_PUBLIC_URL` é o endereço da Vercel: no desktop a origem é `http://tauri.localhost`, então links de convite e de e-mail usam esse valor (`src/lib/publicUrl.ts`). Na web ele pode ficar vazio.
