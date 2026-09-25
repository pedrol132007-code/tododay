# Tododay 🍃

Kanban para equipes. Boards compartilhados, atualização em tempo real e convite por link — no navegador ou como app desktop.

Construído com React 18 + TypeScript e [Supabase](https://supabase.com/) (Postgres + Auth + Realtime). A versão desktop usa [Tauri v2](https://v2.tauri.app/) em volta do mesmo frontend.

## Como usar

- **Navegador:** abra o link da versão web, crie sua conta (confirmando o e-mail) e crie uma equipe — ou abra um link de convite que alguém da equipe te mandou.
- **Desktop (Windows):** baixe o instalador na [página de Releases](https://github.com/pedrol132007-code/tododay/releases/latest) — `Tododay_x.x.x_x64-setup.exe` (ou o `.msi`). A conta e os boards são os mesmos da versão web.

Não precisa clonar o repositório para usar o app. A seção **"Como rodar em dev"** abaixo é só para quem vai desenvolver.

## Funcionalidades

- **Equipes** com papéis (`admin` / `member` / `viewer`) e cargo por membro
- **Convite por link** — uso único, válido por 7 dias, cancelável
- **Boards e colunas** com CRUD completo e reordenação
- **Drag and drop** de cards entre colunas e de colunas entre si
- **Tempo real** — mudanças dos colegas aparecem sem recarregar
- **Painel de detalhe do card** — descrição em Markdown, data de vencimento, responsável
- **Labels** coloridas por board e **checklists** por card
- **Busca global** (`Ctrl+K`) nos boards da equipe
- **Arquivamento** de cards, com restauração/exclusão definitiva
- **Histórico de atividade** por card e por equipe

## Stack

| Camada        | Tecnologia                                                     |
| ------------- | -------------------------------------------------------------- |
| Frontend      | React 18 + TypeScript + Vite                                   |
| Estilo        | Tailwind CSS, identidade visual Benner, tema claro e escuro     |
| Backend       | [Supabase](https://supabase.com/) — Postgres, Auth, Realtime, RLS |
| Web           | [Vercel](https://vercel.com/)                                  |
| Desktop shell | [Tauri v2](https://v2.tauri.app/) (Rust)                       |
| Drag & drop   | [`@dnd-kit`](https://dndkit.com/)                               |
| Server state  | TanStack Query                                                 |
| Testes        | Vitest (frontend) + scripts SQL em `supabase/tests/` (RLS)     |

## Como rodar em dev (só para quem for desenvolver)

1. Crie um projeto no Supabase e rode as migrations de `supabase/migrations/` em ordem no SQL Editor (ou `supabase/setup_producao.sql`, que junta todas).
2. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Project Settings → API; use a chave anon/publishable, nunca a `service_role`).
3. Rode:

```bash
npm install
npm run dev            # versão web em http://localhost:1420
```

### Desktop

Pré-requisitos (uma vez só):

1. Rust via [rustup](https://rustup.rs)
2. Windows: WebView2 Runtime (já vem no Windows 11) + um linker C. Duas opções:
   - Microsoft C++ Build Tools (workload "Desktop development with C++", via Visual Studio Installer).
   - **Sem admin/Visual Studio:** `scoop install mingw` e depois `rustup toolchain install stable-x86_64-pc-windows-gnu` + `rustup override set stable-x86_64-pc-windows-gnu` dentro de `src-tauri/`.

```bash
npm run tauri dev      # janela desktop com hot-reload
npm run tauri build    # instalador de teste (chaves do .env)
npm run desktop:build  # instalador para distribuir (chaves do .env.desktop)
```

> Se rodar `npm run tauri dev` de dentro do Git Bash, o `link.exe` do próprio Git pode sombrear o linker correto no PATH. Use PowerShell/cmd nesse caso.

As chaves são embutidas no instalador na hora do build. Para distribuir, copie `.env.desktop.example` para `.env.desktop`, preencha com o projeto de produção e o endereço da versão web (`VITE_PUBLIC_URL`, usado nos links de convite) e rode `npm run desktop:build`. Sem esse arquivo o build falha, para nunca sair um instalador apontando para o banco de dev.

### Outros comandos

```bash
npm test               # testes (Vitest)
npm run build          # build de produção do frontend (dist/)
```

## Estrutura do projeto

```
src/
  components/   # UI React, por área (auth, team, board, card-detail, search, archive)
  db/           # todo acesso ao Supabase vive aqui — nunca em componentes
  hooks/        # hooks de dados (React Query) por entidade
  lib/          # utilitários puros (posição, atividade, convite pendente)
  types/        # fonte única de verdade dos tipos, espelha as migrations
supabase/
  migrations/   # schema Postgres + RLS, numerado sequencialmente
  tests/        # testes de RLS/regras, rodados no SQL Editor
  templates/    # e-mails de confirmação e recuperação de senha, em PT
src-tauri/      # casca desktop (Tauri), sem lógica própria
```

## Modelo de dados

Fonte autoritativa: [`supabase/migrations/`](supabase/migrations/). Resumo:

- `team` → `board` → `list` → `card` (hierarquia principal)
- `profile`, `team_member` (papel + cargo) e `team_invite` (links de convite)
- `label` e `card_label`, `checklist_item`
- `activity` — histórico, preenchido por triggers

Todo acesso é controlado por Row Level Security: cada usuário só enxerga as equipes de que é membro.

## Status

As 5 fases do app original (local, SQLite) e a migração para Supabase estão concluídas. Detalhes em [`docs/superpowers/plans/`](docs/superpowers/plans/) — a migração em [`2026-09-23-migracao-supabase.md`](docs/superpowers/plans/2026-09-23-migracao-supabase.md).
