# CLAUDE.md

Tododay — kanban de equipe. React 18 + TypeScript + Vite + Tailwind + Supabase (Postgres + Auth + Realtime). Roda no navegador (deploy na Vercel) e como app desktop Tauri v2, que é só uma casca em volta do mesmo frontend — o Rust não tem lógica nem plugins.

Plano da migração para Supabase, com as decisões de produto: `docs/superpowers/plans/2026-09-23-migracao-supabase.md`.

## Convenções

- Todo acesso ao Supabase vive em `src/db/*.ts` (cliente em `src/db/supabase.ts`, com `must()` para desembrulhar `{ data, error }`). Nunca chame o Supabase de dentro de componentes React.
- `src/types/index.ts` é a única fonte de verdade dos tipos TS e espelha exatamente as colunas de `supabase/migrations/`. Ao mudar uma migration, atualize os tipos no mesmo commit.
- IDs são `bigint` no Postgres e `number` no TS; `profile.id` / `user_id` são `uuid` (`string`).
- Migrations são arquivos numerados sequenciais em `supabase/migrations/` (`0001_*.sql`, `0002_*.sql`, ...). Nunca edite uma migration já aplicada — crie uma nova. Não há Supabase CLI: cada migration é colada no SQL Editor do projeto.
- Toda migration nova de schema/RLS vem com um teste em `supabase/tests/NNNN_*_test.sql`: um bloco `DO` que sempre termina com erro para desfazer tudo (`PASSOU: ...` ou `FALHOU: ...`).
- `supabase/setup_producao.sql` é gerado (junção das migrations, para um projeto novo). Não edite à mão.
- Permissões são por equipe (`team_role(team_id)`: `admin` / `member` / `viewer`) e garantidas por RLS no banco. A UI esconde controles de edição do `viewer`, mas quem protege é o RLS.
- Mover cards/colunas usa RPCs no banco (`0004_moves_and_search.sql`), não updates soltos de `position`.
- Posições (`position`) são `double precision`. Inserir no fim: `MAX(position) + 1`. Reordenar entre dois itens: média dos vizinhos (`src/lib/position.ts`).
- Mudanças de outros usuários chegam via Realtime por board (`src/db/realtime.ts` → `useRealtimeSync`), que só invalida queries do React Query.
- Só a chave anon/publishable vai para o frontend (`VITE_SUPABASE_*`). A `service_role` nunca entra no app.
- Visual segue a identidade da Benner (`docs/identidade-benner/`). Cores só pelos tokens semânticos do Tailwind (`primary`, `danger`, `highlight`, `on-accent`, `bg-base/surface/elevated/column/card`, `text-primary/muted`, `border`), que são variáveis CSS em `src/index.css` com versão clara (`:root`) e escura (`.dark`). Nunca use hex ou cores do Tailwind (`bg-blue-500`) direto em componentes. Azul = ação principal, vermelho = perigo/erro, laranja = hover/seleção.
- Botão de ação principal usa a classe `.btn-primary` (caixa alta, hover laranja); o componente só define padding/largura.
- Tema: `useTheme` (sistema/claro/escuro, salvo em `tododay.theme`) + script inline no `index.html` que aplica a classe `dark` antes do React. Fonte: Montserrat (a da Benner, mundial, é licenciada pelo Adobe Fonts).
- Sem abstrações antecipadas — resolva o problema atual, não o hipotético.

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
- Web: `vercel.json` (SPA, tudo reescreve para `index.html`). Templates de e-mail em PT em `supabase/templates/`, colados no painel do Supabase.

## Como rodar em dev

Web (só precisa de Node):

```bash
npm install
npm run dev        # http://localhost:1420
npm test           # Vitest
```

Desktop — pré-requisitos (uma vez só):

1. [Node.js LTS](https://nodejs.org)
2. Rust via [rustup](https://rustup.rs)
3. Windows: WebView2 Runtime (já vem no Windows 11) + um linker C. Duas opções:
   - Microsoft C++ Build Tools (workload "Desktop development with C++", via Visual Studio Installer) — toolchain MSVC padrão do Rust no Windows.
   - **Sem admin/Visual Studio:** `scoop install mingw` e depois `rustup toolchain install stable-x86_64-pc-windows-gnu` + `rustup override set stable-x86_64-pc-windows-gnu` dentro de `src-tauri/`. Evita o instalador da Microsoft; usado neste ambiente de dev.

```bash
npm run tauri dev      # janela desktop com hot-reload
npm run tauri build    # instalador em src-tauri/target/release/bundle/
```

Se rodar `npm run tauri dev` de dentro do Git Bash, o `link.exe` do próprio Git (`usr/bin/link.exe`, uma ferramenta de hard link) pode sombrear o linker correto no PATH. Rode pelo PowerShell/cmd nesse caso, ou garanta que o PATH do MinGW/MSVC vem antes do Git no PATH.

O build desktop embute as variáveis do `.env` no momento do build — para um instalador que aponte para produção, gere com as chaves do `tododay-prod`.
