# Equipe e status de tarefas — design

Data: 2026-09-23 · Branch: `feature/equipe-e-status`

## Objetivo

1. Um ícone no canto superior esquerdo abre a **aba Equipe**: um diretório local de
   membros (nome, função, contato, observações, cor) mais um resumo de andamento.
2. Cada card ganha um **status fixo** — Planejada, Em processo ou Finalizada —
   escolhido ao criar a tarefa.
3. Cada card pode registrar **quem pediu** a tarefa ("por Ana"), apontando para um
   membro. Cada membro tem uma cor, usada onde ele aparece.

O app continua single-user, offline e sem nuvem. Membros são só registros locais:
ninguém além do usuário acessa o app. Isso não é colaboração — é um catálogo de
pessoas para dar contexto às tarefas.

## Fora de escopo

- Filtrar o board por membro ou status.
- Foto/avatar de membro.
- Mudar o card de coluna automaticamente ao trocar o status (ou vice-versa).
  Status e coluna são independentes.
- Campo "responsável" (quem executa). Só "pedido por".
- Corrigir `PRAGMA foreign_keys` (ver "Achado").

## Modelo de dados

Nova migration `src-tauri/migrations/0002_members_status.sql`, registrada em
`src-tauri/src/main.rs` como versão 2:

```sql
CREATE TABLE member (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  position REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE card ADD COLUMN status TEXT NOT NULL DEFAULT 'planned'
  CHECK (status IN ('planned', 'in_progress', 'done'));
ALTER TABLE card ADD COLUMN requested_by INTEGER REFERENCES member(id);

CREATE INDEX idx_card_requested_by ON card(requested_by);
```

- Membros são **globais** (não pertencem a um board).
- Cards existentes recebem `status = 'planned'` e `requested_by = NULL`.
- Rótulos de tela: `planned` → "Planejada", `in_progress` → "Em processo",
  `done` → "Finalizada". O mapa fica num único lugar (`src/lib/status.ts`) para
  trocar o texto sem tocar no banco.

### Tipos (`src/types/index.ts`)

```ts
export type CardStatus = "planned" | "in_progress" | "done";

export interface Member {
  id: number;
  name: string;
  role: string;
  contact: string;
  notes: string;
  color: string;
  position: number;
  created_at: string;
}

// Card ganha:
//   status: CardStatus;
//   requested_by: number | null;
```

### Banco separado em dev

Builds de debug (`npm run tauri dev`) usam `kanban-dev.db` no mesmo diretório;
release continua em `kanban.db`. Sem isso, rodar esta branch aplicaria a migration 2
no banco real, e o Tododay 1.0.0 instalado (que só conhece a migration 1) deixaria
de abrir o banco até o merge.

### Achado: foreign keys desligadas

`src/db/client.ts` nunca executa `PRAGMA foreign_keys = ON`, então nenhum
`ON DELETE` do schema dispara hoje. Por isso `deleteMember` faz explicitamente
`UPDATE card SET requested_by = NULL WHERE requested_by = $1` antes do `DELETE`.
Ligar o pragma é uma mudança de comportamento global (passa a cascatear exclusões
de board/lista/card) e fica para um trabalho separado.

## Camada de dados

`src/db/members.ts` (novo):

- `getMembers(): Member[]` — ordenado por `position`.
- `createMember(name, color): number` — `position = MAX(position) + 1`.
- `updateMember(id, patch: Partial<Pick<Member, "name"|"role"|"contact"|"notes"|"color">>)`.
- `deleteMember(id)` — limpa `requested_by` nos cards e depois apaga o membro.
- `getStatusSummaryByBoard(): { board_id, board_name, planned, in_progress, done }[]`
  — conta cards com `archived_at IS NULL`, todos os boards (inclui boards sem cards,
  com zeros).
- `getMemberRequestStats(): { member_id, planned, in_progress, done }[]` — mesmo
  filtro de não arquivados.

`src/db/cards.ts` (estendido):

- `createCard(listId, title, status = 'planned', requestedBy = null)`.
- `updateCardStatus(id, status)` e `updateCardRequestedBy(id, memberId | null)`,
  ambos atualizando `updated_at`.
- Os `SELECT` de card já usam `card.*`, então `status` e `requested_by` vêm
  sem mudança nas queries — só os tipos mudam.

`src/hooks/useMembers.ts` (novo): hooks React Query para as funções acima, no mesmo
padrão de `useLabels.ts`. Mutations de card invalidam também as queries de resumo;
mutations de membro invalidam membros, resumo e as queries de card (para o "por X").

## Paleta de cores

`src/lib/memberColors.ts`: lista fixa de ~10 hex que funcionam sobre o fundo
escuro do app, e `nextMemberColor(usedColors)` — a primeira cor da paleta não
usada; se todas estiverem em uso, cicla pela quantidade de membros. Função pura,
com teste unitário.

## Telas

### Navegação (`App.tsx`)

`showArchive: boolean` vira `view: "board" | "archive" | "team"`. À esquerda do
`BoardSwitcher` entra um botão-ícone (pessoas, SVG inline, `aria-label="Equipe"`)
que alterna entre `team` e `board`. Selecionar um board ou navegar pela busca volta
para `board`. O botão "Arquivados" continua igual.

### Aba Equipe (`src/components/team/TeamView.tsx`)

- **Resumo de status**: tabela com uma linha por board e colunas
  Planejada / Em processo / Finalizada / Total, mais uma linha de total geral.
- **Membros**: um cartão por membro com bolinha de cor (clicável → paleta),
  nome, função, contato e observações editáveis inline (`InlineEditableText`),
  e a linha "pediu N · X em processo · Y finalizadas". Botão "+ Membro" cria com
  a próxima cor livre e foca o nome. Excluir pede confirmação
  ("Os cards pedidos por Ana ficarão sem 'pedido por'.").
- Estado vazio: "Nenhum membro ainda."

### Criar card (`List.tsx`)

Abaixo do input de título: três chips de status (Planejada selecionado por
padrão) e um select "Pedido por" (opção "—" + membros com a cor). Enter cria com
os valores escolhidos; depois de criar, os campos voltam ao padrão.

### Card no board (`Card.tsx`)

Selo de status (bolinha + texto curto: cinza para Planejada, âmbar para Em
processo, verde para Finalizada) e, se houver `requested_by`, "por Ana" com a
bolinha na cor do membro. O mapa id → membro vem de `useMembers()` no `BoardView`
e desce por props.

### Painel de detalhe (`CardDetailPanel.tsx`)

Seção com os mesmos chips de status e o select "Pedido por", editando na hora.

## Erros

Mesmo padrão das features existentes: mutations do React Query; falha mantém o
estado anterior na tela. O `CHECK` do banco garante que um status inválido nunca
é gravado.

## Testes

- Unitários (vitest): `nextMemberColor` e o mapa de rótulos de status.
- Manual em `npm run tauri dev`: migration aplicando num banco existente (cards
  antigos viram Planejada); CRUD de membro; criar card com status e "pedido por";
  trocar ambos no painel; excluir membro e ver o card perder o "por X"; conferir
  as contagens da tabela ao criar, mudar status e arquivar cards.
