# Kanban Desktop Pessoal — Design

Data: 2026-09-17
Status: Aprovado, pronto para plano de implementação

## Objetivo

App desktop de kanban pessoal, estilo Trello, single-user, offline-first,
sob medida para evoluir continuamente. Prioridade: código simples e fácil
de modificar, sem abstrações espertas antecipadas.

## Stack

- Tauri v2 (Rust) + React 18 + TypeScript + Vite
- SQLite local via `@tauri-apps/plugin-sql`, com migrations versionadas
- `@dnd-kit/core` + `@dnd-kit/sortable` para drag and drop
- Tailwind CSS
- TanStack Query (React Query) para cache/estado derivado do SQLite
- `react-markdown` + `remark-gfm` para preview de markdown
- `framer-motion` para animações leves de entrada
- Sem backend, sem autenticação, sem nuvem

## Decisões técnicas (com alternativas consideradas)

| Decisão | Escolha | Alternativa descartada |
|---|---|---|
| Acesso a dados | `@tauri-apps/plugin-sql` direto do JS | Comandos Rust (`#[tauri::command]`) por operação — mais código, duas linguagens em sincronia |
| Estado/cache | TanStack Query | useState+Context puro / Zustand — mais boilerplate manual |
| IDs | `INTEGER PRIMARY KEY AUTOINCREMENT` | UUID v4 — over-engineering para single-user local |
| Markdown | `react-markdown` + `remark-gfm` | `marked` + `DOMPurify` — menos componentizado |
| Tipos TS | Mantidos manualmente em `src/types/index.ts`, espelhando as migrations | Codegen automático a partir do SQL — não há ferramenta madura simples para SQLite + este stack; manter sincronizado à mão é aceitável no escopo atual |

## Estrutura de pastas

```
projeto/
├── CLAUDE.md
├── package.json / vite.config.ts / tsconfig.json / tailwind.config.ts
├── index.html
├── src/                              # frontend React
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css                     # Tailwind + tokens de cor/tema
│   ├── types/
│   │   └── index.ts                  # única fonte de verdade dos tipos TS
│   ├── db/                           # TODA query SQL vive aqui, nada nos componentes
│   │   ├── client.ts                 # conexão singleton com o plugin-sql
│   │   ├── boards.ts
│   │   ├── lists.ts
│   │   ├── cards.ts
│   │   ├── labels.ts
│   │   ├── checklistItems.ts
│   │   └── search.ts
│   ├── hooks/                        # React Query wrapping src/db
│   │   ├── useBoards.ts
│   │   ├── useLists.ts
│   │   ├── useCards.ts
│   │   └── useSearch.ts
│   ├── components/
│   │   ├── board/                    # BoardSwitcher, BoardView, List, Card
│   │   ├── card-detail/              # CardDetailPanel, MarkdownEditor, LabelPicker, Checklist
│   │   ├── search/                   # CommandPalette (Ctrl+K)
│   │   ├── archive/                  # ArchiveView
│   │   └── ui/                       # primitivos reutilizáveis (Button, Panel, Modal...)
│   └── lib/
│       ├── position.ts               # helpers de posição fracionária (meio, rebalanceamento)
│       └── shortcuts.ts              # registro central de atalhos de teclado
└── src-tauri/                        # backend Rust/Tauri
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── src/main.rs                   # bem enxuto: só bootstrap + registro do plugin-sql
    └── migrations/
        ├── 0001_init.sql
        └── ...
```

## Modelo de dados

```sql
CREATE TABLE board (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  position REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position REAL NOT NULL,
  wip_limit INTEGER
);

CREATE TABLE card (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES list(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position REAL NOT NULL,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE TABLE label (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE card_label (
  card_id INTEGER NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  label_id INTEGER NOT NULL REFERENCES label(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

CREATE TABLE checklist_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL
);

CREATE INDEX idx_list_board ON list(board_id);
CREATE INDEX idx_card_list ON card(list_id);
CREATE INDEX idx_card_archived ON card(archived_at);
CREATE INDEX idx_checklist_card ON checklist_item(card_id);
```

**Posições fracionárias:** ao mover um item, a nova posição é a média entre
os vizinhos (`(prev + next) / 2`). `lib/position.ts` fornece um helper que
rebalanceia (renumera 1, 2, 3...) quando o espaço entre floats fica
pequeno demais, evitando colisão silenciosa após muitas reordenações.

## Identidade visual

Modo escuro, inspirado em GTA VI — roxos, tons litorâneos suaves, amarelo
quente, cantos arredondados.

```
--bg-base:      #16121f
--bg-surface:   #1f1a2e
--bg-elevated:  #2a2340
--accent-purple:#a78bfa
--accent-pink:  #f0a6c4
--accent-yellow:#f5d68a
--text-primary: #f2eef9
--text-muted:   #a99fc2
--border:       #35304a
```

- Cantos arredondados generosos (`rounded-xl`/`rounded-2xl`)
- Fonte **Manrope** em toda a interface
- `framer-motion`: fade + slide sutil na entrada de cards e no painel
  lateral de detalhe; sem bounce exagerado
- Cores de label são livres (campo `label.color`), não limitadas à paleta
  base

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl+K` | Busca global |
| `Ctrl+N` | Novo card na lista focada/última usada |
| `Ctrl+B` | Nova lista |
| `Esc` | Fecha painel de detalhe / busca |
| `Ctrl+Enter` | Salva e fecha painel de detalhe (foco em textarea) |
| `Ctrl+/` | Mostra atalhos disponíveis |
| `Ctrl+1..9` | Troca rápida entre boards |

## Restrição de ambiente

A máquina de desenvolvimento não tem Node.js, npm nem Rust/Cargo
instalados, e a instalação exige senha de administrador (WebView2 Runtime,
MSVC Build Tools). O código de cada fase será escrito e revisado
normalmente; a validação por execução (`npm install`, `tauri dev`) fica
pendente até o toolchain ser instalado.

## Fases de entrega

1. Setup do projeto + schema + migrations + board vazio renderizando
2. CRUD de colunas e cards, sem drag and drop
3. Drag and drop
4. Painel de detalhe do card
5. Busca, labels, checklist, arquivamento

Cada fase entrega de ponta a ponta e para para descrever como testar.

## Fora do escopo (por enquanto)

Colaboração, comentários, anexos, notificações, integrações externas,
mobile.
