# CLAUDE.md

Tododay — kanban pessoal desktop, single-user, offline-first, sem nuvem. Tauri v2 (Rust) + React 18 + TypeScript + Vite + Tailwind + SQLite (`@tauri-apps/plugin-sql`).

## Convenções

- Toda query SQL vive em `src/db/*.ts`. Nunca escreva SQL dentro de componentes React.
- `src/types/index.ts` é a única fonte de verdade dos tipos TS e espelha exatamente as colunas de `src-tauri/migrations/`. Ao mudar uma migration, atualize os tipos no mesmo commit.
- Colunas booleanas no SQLite são `INTEGER` 0/1 (ex: `checklist_item.done`); a camada `src/db/` converte para `boolean` antes de expor ao resto do app — nunca exponha `0`/`1` cru fora de `src/db/`.
- Migrations são arquivos numerados sequenciais em `src-tauri/migrations/` (`0001_*.sql`, `0002_*.sql`, ...). Nunca edite uma migration já commitada — crie uma nova.
- Posições (`position`) são `REAL`. Inserir no fim de uma lista: `MAX(position) + 1`. Reordenar entre dois itens existentes: média dos vizinhos, com rebalanceamento ocasional (`src/lib/position.ts`, a partir da Fase 3).
- Sem abstrações antecipadas — resolva o problema da fase atual, não o hipotético da próxima.
- Fora de escopo por enquanto: colaboração, comentários, anexos, notificações, integrações externas, mobile.

## Modelo de dados

Ver `src-tauri/migrations/0001_init.sql` (fonte autoritativa). Resumo:

- `board(id, name, position, created_at)`
- `list(id, board_id, name, position, wip_limit)`
- `card(id, list_id, title, description, position, due_date, created_at, updated_at, archived_at)`
- `label(id, board_id, name, color)`
- `card_label(card_id, label_id)` — chave composta
- `checklist_item(id, card_id, text, done, position)`

## Como rodar em dev

Pré-requisitos (uma vez só):

1. [Node.js LTS](https://nodejs.org)
2. Rust via [rustup](https://rustup.rs)
3. Windows: WebView2 Runtime (já vem no Windows 11) + um linker C. Duas opções:
   - Microsoft C++ Build Tools (workload "Desktop development with C++", via Visual Studio Installer) — toolchain MSVC padrão do Rust no Windows.
   - **Sem admin/Visual Studio:** `scoop install mingw` e depois `rustup toolchain install stable-x86_64-pc-windows-gnu` + `rustup override set stable-x86_64-pc-windows-gnu` dentro de `src-tauri/`. Evita o instalador da Microsoft; usado neste ambiente de dev.

Depois:

```bash
npm install
npm run tauri dev
```

Se rodar `npm run tauri dev` de dentro do Git Bash, o `link.exe` do próprio Git (`usr/bin/link.exe`, uma ferramenta de hard link) pode sombrear o linker correto no PATH. Rode pelo PowerShell/cmd nesse caso, ou garanta que o PATH do MinGW/MSVC vem antes do Git no PATH.

Isso abre a janela do app com hot-reload do frontend. O banco SQLite (`kanban.db`) é criado automaticamente no diretório de dados do app na primeira execução, com o schema aplicado pelas migrations.

Para gerar os ícones definitivos do app (o placeholder atual é um quadrado roxo sólido):

```bash
npm run tauri icon caminho/para/uma/imagem.png
```

## Fases do projeto

1. Setup do projeto + schema + migrations + board vazio renderizando
2. CRUD de colunas e cards, sem drag and drop
3. Drag and drop
4. Painel de detalhe do card
5. Busca, labels, checklist, arquivamento

Spec completo: `docs/superpowers/specs/2026-09-17-kanban-desktop-design.md`
