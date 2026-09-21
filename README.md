# Tododay 🍃

Kanban pessoal para desktop. Offline-first, sem nuvem, sem login — só você e seus cards.

Construído com [Tauri v2](https://v2.tauri.app/) (Rust) + React 18 + TypeScript, com um banco SQLite local que vive inteiramente na sua máquina.

## Funcionalidades

- **Boards e colunas** com CRUD completo e reordenação
- **Drag and drop** de cards entre colunas e de colunas entre si
- **Painel de detalhe do card** — descrição em Markdown, data de vencimento
- **Labels** coloridas por board, atribuídas por card
- **Checklists** por card, com progresso visível no card fechado
- **Busca global** (`Ctrl+K`) entre boards, colunas e cards
- **Arquivamento** de cards, com tela de restauração/exclusão definitiva

## Stack

| Camada       | Tecnologia                                                      |
| ------------ | ----------------------------------------------------------------|
| Desktop shell| [Tauri v2](https://v2.tauri.app/) (Rust)                        |
| Frontend     | React 18 + TypeScript + Vite                                    |
| Estilo       | Tailwind CSS                                                    |
| Dados        | SQLite via [`@tauri-apps/plugin-sql`](https://v2.tauri.app/plugin/sql/) |
| Drag & drop  | [`@dnd-kit`](https://dndkit.com/)                                |
| Server state | TanStack Query                                                  |
| Testes       | Vitest                                                           |

## Como rodar em dev

Pré-requisitos (uma vez só):

1. [Node.js LTS](https://nodejs.org)
2. Rust via [rustup](https://rustup.rs)
3. Windows: WebView2 Runtime (já vem no Windows 11) + um linker C. Duas opções:
   - Microsoft C++ Build Tools (workload "Desktop development with C++", via Visual Studio Installer).
   - **Sem admin/Visual Studio:** `scoop install mingw` e depois `rustup toolchain install stable-x86_64-pc-windows-gnu` + `rustup override set stable-x86_64-pc-windows-gnu` dentro de `src-tauri/`.

Depois:

```bash
npm install
npm run tauri dev
```

> Se rodar `npm run tauri dev` de dentro do Git Bash, o `link.exe` do próprio Git pode sombrear o linker correto no PATH. Use PowerShell/cmd nesse caso.

Isso abre a janela do app com hot-reload do frontend. O banco SQLite (`kanban.db`) é criado automaticamente no diretório de dados do app na primeira execução, com o schema aplicado pelas migrations em `src-tauri/migrations/`.

### Outros comandos

```bash
npm run test           # roda os testes (Vitest)
npm run build           # build de produção do frontend
npm run tauri build     # gera o instalador desktop
```

## Estrutura do projeto

```
src/
  components/   # UI React, organizada por área (board, card-detail, search, archive)
  db/           # toda query SQL vive aqui — nunca em componentes
  hooks/        # hooks de dados (React Query) por entidade
  lib/          # utilitários puros (ex: cálculo de posição para reordenação)
  types/        # fonte única de verdade dos tipos, espelha as migrations
src-tauri/
  migrations/   # schema SQLite, numerado sequencialmente
  src/          # entrypoint Rust/Tauri
```

## Modelo de dados

Ver [`src-tauri/migrations/0001_init.sql`](src-tauri/migrations/0001_init.sql), a fonte autoritativa. Resumo:

- `board` → `list` → `card` (hierarquia principal)
- `label` e `card_label` (N:N entre cards e labels de um board)
- `checklist_item` (itens de checklist por card)

## Status

Projeto pessoal, desenvolvido em fases — todas as 5 fases planejadas (setup, CRUD, drag and drop, painel de detalhe, busca/labels/checklist/arquivamento) estão concluídas. Detalhes de cada fase em [`docs/superpowers/plans/`](docs/superpowers/plans/) e o spec completo em [`docs/superpowers/specs/2026-09-17-kanban-desktop-design.md`](docs/superpowers/specs/2026-09-17-kanban-desktop-design.md).
