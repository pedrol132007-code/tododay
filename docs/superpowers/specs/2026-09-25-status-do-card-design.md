# Status do card — design (proposta, aguardando revisão)

Data: 2026-09-25 · Base: spec `2026-09-23-equipe-e-status-design.md` da branch
`feature/equipe-e-status` (era SQLite/single-user), adaptada para o app com Supabase.

**Nada disto foi implementado.** Muda o schema do Postgres, então precisa de aprovação e de
uma ordem de deploy cuidadosa (ver "Implantação").

## Objetivo

1. Cada card tem um **status fixo** — Planejada, Em processo ou Finalizada — escolhido ao
   criar e editável no painel.
2. A **aba Equipe** ganha um resumo de andamento: por board, quantos cards em cada status.

Status e coluna continuam independentes (mudar um não mexe no outro), como na spec original.

## Fora de escopo

- **"Pedido por"** (quem pediu a tarefa). Na spec original apontava para um diretório local de
  membros; aqui apontaria para `profile` como o `assignee_id`. Fica para depois, se fizer
  sentido ao lado do "responsável" que já existe.
- Diretório de membros com contato/observações (substituído pelos membros reais da equipe).
- Filtrar o board por status.

## Banco — `supabase/migrations/0010_card_status.sql`

```sql
alter table public.card
  add column status text not null default 'planned'
  check (status in ('planned', 'in_progress', 'done'));

-- Resumo por board para a aba Equipe. security invoker: o RLS de card/board decide o que
-- cada um vê; quem não é da equipe recebe zero linhas.
create function public.board_status_summary(p_team_id bigint)
returns table (board_id bigint, board_name text, planned bigint, in_progress bigint, done bigint)
language sql stable security invoker as $$
  select b.id, b.name,
         count(c.id) filter (where c.status = 'planned'),
         count(c.id) filter (where c.status = 'in_progress'),
         count(c.id) filter (where c.status = 'done')
  from public.board b
  left join public.card c on c.board_id = b.id and c.archived_at is null
  where b.team_id = p_team_id
  group by b.id, b.name, b.position
  order by b.position;
$$;
```

- Cards existentes recebem `planned`.
- **Atividade:** o trigger `card_log_activity` (0009) passa a registrar `status_changed` com
  `{ from, to }` no payload. `src/lib/activity.ts` ganha o texto ("moveu para Em processo").
- **Realtime:** nada novo — mudanças em `card` já invalidam as queries do board.
- **Teste SQL** `supabase/tests/0010_card_status_test.sql`, no formato dos outros: status
  inválido é recusado; leitor não muda status; o resumo não vaza boards de outra equipe;
  arquivados não contam.
- Regenerar `supabase/setup_producao.sql` com a 0010.

## Tipos e dados

- `src/types/index.ts`: `CardStatus = "planned" | "in_progress" | "done"`; `Card.status`;
  `BoardStatusSummary`.
- `src/lib/status.ts` (puro, testado): `STATUS_ORDER` e `STATUS_LABELS`
  (`Planejada`, `Em processo`, `Finalizada`) — o único lugar com os textos.
- `src/db/cards.ts`: `createCard(listId, title, status = "planned")` e
  `updateCardStatus(id, status)`. `src/db/teams.ts`: `getBoardStatusSummary(teamId)` (RPC).
- Hooks em `useCards.ts` / `useTeams.ts`; mutations de card invalidam também o resumo.

## Visual (identidade Benner)

- Tokens novos em `src/index.css`, claro e escuro: `--status-planned` (cinza),
  `--status-in-progress` (laranja `#FBA747`), `--status-done` (verde). Nada de hex em componente.
- `StatusBadge`: bolinha + texto curto; na densidade compacta, só a bolinha com `title`.
- `StatusPicker`: três chips (segmentado, igual ao da tela Configurações).

## Telas

- **Criar card (`List.tsx`):** chips de status abaixo do "Novo card...", Planejada por padrão;
  voltam ao padrão depois de criar. Some para o leitor, como o resto da edição.
- **Card (`Card.tsx`):** `StatusBadge` ao lado do responsável.
- **Painel (`CardDetailPanel.tsx`):** seção "Status" com o `StatusPicker`, salvando na hora.
- **Equipe (`TeamView.tsx`):** tabela "Andamento" — uma linha por board, colunas
  Planejada / Em processo / Finalizada / Total e uma linha de total.

## Implantação (ordem importa)

1. Aplicar a 0010 no `tododay-dev`, rodar o teste SQL e `npm run test:e2e`.
2. Aplicar a 0010 no `tododay-prod` (SQL Editor).
3. Só então publicar a web na Vercel e gerar o instalador.

Clientes antigos (instaladores já distribuídos) continuam funcionando: não mandam `status`, e
o banco usa o padrão `planned`.

## Testes

- Vitest: `status.ts` (rótulos e ordem) e o texto novo em `activity.ts`.
- SQL: `0010_card_status_test.sql`.
- Playwright: estender `e2e/app.spec.ts` — criar card como "Em processo", ver o selo, trocar
  para "Finalizada" no painel e conferir a contagem na aba Equipe.

## Perguntas para decidir

1. O "pedido por" entra nesta etapa ou fica de fora?
2. Card na coluna "Feito" deveria sugerir "Finalizada"? (A proposta mantém independentes.)
