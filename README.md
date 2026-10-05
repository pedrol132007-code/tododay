# Tododay 🍃

Kanban para equipes pequenas. Os boards são compartilhados e se atualizam em tempo real, e o dashboard mostra como a equipe está: entregas, prazos, tarefas paradas e carga de cada pessoa. Funciona no navegador ou como app desktop no Windows.

Está em **beta**, sendo usado por uma equipe piloto. As mudanças de cada versão ficam no [CHANGELOG](CHANGELOG.md).

## Como usar

- **Navegador:** o acesso é por convite. Um admin da equipe manda o convite, e você entra pelo link recebido.
- **Desktop (Windows):** baixe o instalador na [página de Releases](https://github.com/pedrol132007-code/tododay/releases/latest). A conta e os boards são os mesmos da versão web.

Para usar o app não é preciso clonar o repositório. O resto deste arquivo é para quem vai desenvolver.

## Funcionalidades

- **Board**: colunas com tipo e limite de WIP; cards com responsável, prazo, prioridade, etiquetas, checklist e anexos. Também tem drag and drop, filtros na URL, busca global (`Ctrl+K`), arquivamento e tempo real.
- **Dashboard**: entregas, lead time, backlog, no prazo, bloco **Atenção** e **Carga da equipe**. Nesta versão mostra apenas dados de demonstração.
- **Equipes**: papéis `admin` / `member` / `viewer` garantidos no banco (RLS), convite por link e histórico de atividade.

## Stack

| Camada        | Tecnologia                                                         |
| ------------- | ------------------------------------------------------------------ |
| Frontend      | React 18 + TypeScript + Vite, Tailwind CSS, TanStack Query          |
| Backend       | [Supabase](https://supabase.com/): Postgres com RLS, Auth, Realtime, Storage e Edge Functions |
| Web           | [Vercel](https://vercel.com/)                                       |
| Desktop       | [Tauri v2](https://v2.tauri.app/), só uma casca em volta do mesmo frontend |
| Testes        | Vitest, Playwright e scripts SQL em `supabase/tests/`               |

## Ambientes

| Ambiente           | Supabase       | Onde roda                                       | Dados                                   |
| ------------------ | -------------- | ----------------------------------------------- | --------------------------------------- |
| **Desenvolvimento** | `tododay-dev`  | `npm run dev` (localhost:1420) e previews da Vercel | de teste; a demonstração fica disponível |
| **Produção**        | `tododay-prod` | Vercel, a partir do branch `master`             | reais, da equipe piloto                 |

As variáveis de cada ambiente ficam fora do repositório. Localmente vão no `.env`, a partir do [`.env.example`](.env.example). Em produção ficam nas variáveis da Vercel. O frontend recebe apenas a chave pública (anon/publishable). A `service_role` nunca entra no app nem no repositório.

## Como rodar localmente

Precisa só do [Node.js](https://nodejs.org) LTS.

1. Copie `.env.example` para `.env` e preencha com o projeto de **desenvolvimento** (Supabase → Project Settings → API).
2. Rode:

```bash
npm install
npm run dev            # http://localhost:1420
npm run lint           # ESLint
npm test               # testes unitários (Vitest)
npm run test:e2e:mock  # ponta a ponta simulados, sem banco
npm run test:e2e       # ponta a ponta no Supabase de dev (precisa de SUPABASE_DB_URL)
npm run build          # build de produção (dist/)
```

Num projeto Supabase novo, rode as migrations de `supabase/migrations/` em ordem no SQL Editor, ou cole `supabase/setup_producao.sql`, que junta todas.

## Fluxo de branches

- O **`master` é produção**: cada push nele publica o site na Vercel.
- Ninguém faz push direto no `master`. Toda mudança entra por **pull request**, e o merge só acontece com o [CI](.github/workflows/ci.yml) passando (lint, testes e build).
- O pull request ganha um preview da Vercel, apontado para o ambiente de desenvolvimento.
- Mudança de banco é uma migration nova em `supabase/migrations/`, com o teste em `supabase/tests/`. O CI aplica todas do zero num banco descartável e roda os testes SQL. No merge, o workflow **Deploy do banco** aplica no dev e no prod só o que falta e publica as Edge Functions; no fim, `npm run check:prod` confere o prod.
- As dependências são atualizadas pelo Dependabot, toda semana.

Os passos de deploy, primeiro admin, convites, backup e como reverter ficam em [LANCAMENTO.md](LANCAMENTO.md).

## Desktop

Pré-requisitos (uma vez só):

1. Rust via [rustup](https://rustup.rs)
2. Windows: WebView2 Runtime (já vem no Windows 11) e um linker C. Duas opções:
   - Microsoft C++ Build Tools (workload "Desktop development with C++", via Visual Studio Installer).
   - **Sem admin nem Visual Studio:** `scoop install mingw`, depois `rustup toolchain install stable-x86_64-pc-windows-gnu` e `rustup override set stable-x86_64-pc-windows-gnu` dentro de `src-tauri/`.

```bash
npm run tauri dev      # janela desktop com hot-reload
npm run tauri build    # instalador de teste (chaves do .env)
npm run desktop:build  # instalador para distribuir (chaves do .env.desktop)
```

> Se rodar `npm run tauri dev` de dentro do Git Bash, o `link.exe` do próprio Git pode tomar o lugar do linker certo no PATH. Nesse caso, use o PowerShell ou o cmd.

As chaves entram no instalador na hora do build. Para distribuir, copie `.env.desktop.example` para `.env.desktop` e preencha com o projeto de produção e o endereço da versão web. Sem esse arquivo o build falha, para nunca sair um instalador apontando para o banco de dev.

## Estrutura do projeto

```
src/
  components/   # UI React, por área (auth, team, board, card-detail, dashboard, ...)
  db/           # todo acesso ao Supabase vive aqui, nunca em componentes
  hooks/        # hooks de dados (React Query) por entidade
  lib/          # funções puras (filtros, métricas, regras do dashboard, posição)
  types/        # fonte única de verdade dos tipos, espelha as migrations
supabase/
  migrations/   # schema Postgres + RLS, numerado em sequência
  tests/        # testes de RLS e regras, rodados no SQL Editor
  functions/    # Edge Functions (anexos)
  templates/    # e-mails em PT
src-tauri/      # casca desktop (Tauri), sem lógica própria
```

O modelo de dados e as convenções do código estão em [CLAUDE.md](CLAUDE.md).
