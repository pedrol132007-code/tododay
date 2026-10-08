# Líder único e boards por pessoa

Projeto 1 de 2 (o 2 é o Dashboard com dados reais, só para líder e admins). Decidido com o usuário
em 2026-10-08.

## Objetivo

Cada equipe tem no máximo um líder. Cada board tem as suas pessoas: o líder monta, por exemplo,
um board com ele e Fulano e outro com ele e Ciclano, e quem não participa de um board não o vê.
Membros passam a criar, renomear e reordenar colunas.

## Quem pode o quê

| | Admin | Líder | Membro | Leitor |
|---|---|---|---|---|
| Ver boards | todos | todos | só os seus | só os seus |
| Cards (criar, editar, mover, anexos, checklist, etiquetas) | sim | sim | sim | não |
| Criar, renomear e reordenar colunas | sim | sim | sim | não |
| Excluir coluna, mudar tipo (`status`) e limite (`wip_limit`) | sim | sim | não | não |
| Criar e renomear boards | sim | sim | não | não |
| Escolher as pessoas de cada board | sim | sim | não | não |
| Excluir board | sim | não | não | não |
| Dar a coroa, convidar, papéis, desativar | sim | não | não | não |

"Líder" é `team_member.is_leader` de alguém com papel `member` ou `admin` e ativo. Um admin que é
líder tem tudo das duas colunas. A coroa continua só com o admin (tela Equipe).

## Líder único

- Índice único parcial `team_member (team_id) where is_leader`.
- Dar a coroa a alguém tira a do líder anterior no mesmo update (trigger `before update of
  is_leader`, security definer). A atividade registra `member.leader_off` do anterior e
  `member.leader_on` do novo (os triggers da 0016 já fazem isso).
- Migração: equipe com mais de um líder fica com quem ganhou a coroa por último (último
  `member.leader_on` na atividade; sem registro, o primeiro por `user_id`).
- UI: a coroa na tela Equipe diz "Tornar líder" e, se já houver um, avisa que a coroa passa
  ("Fulano deixa de ser líder").

## Pessoas do board

- Tabela `board_member (board_id, user_id, added_at)`, chave `(board_id, user_id)`, os dois com
  `on delete cascade`. Admin e líder não precisam estar nela: veem todos os boards da equipe.
- Acesso a um board: `board_role_of(board_id, user_id)` devolve o papel na equipe de quem está
  ativo e é admin, líder ou está em `board_member`; senão `null`. `board_role(board_id)` passa a ser
  `board_role_of(board_id, auth.uid())`. Como toda RLS de `list`, `card`, `label`, `card_label`,
  `checklist_item`, `card_attachment`, `card_status_history`, Storage e Realtime passa por
  `board_role`/`card_role`, tudo respeita o board de uma vez.
- `can_manage_board(board_id)`: admin ou líder da equipe do board (ativo). Usada por excluir
  coluna, mudar `status`/`wip_limit`, renomear board e escolher pessoas.
- `can_manage_team_boards(team_id)`: o mesmo, por equipe (criar board).
- Migração: todo mundo que já está na equipe (inclusive desativados, para reativar sem perder nada)
  entra em todos os boards existentes. Ninguém perde acesso no deploy.
- Board novo: quem cria escolhe as pessoas na hora (opcional) e pode mudar depois em
  "Pessoas do board", no menu do board.
- Membro novo da equipe (convite) não entra em nenhum board: admin ou líder o põe nos boards. As
  boas-vindas de quem não tem nenhum board dizem para pedir ao líder.
- Atribuir card: só a quem tem acesso ao board (`validate_card_assignee` passa a usar
  `board_role_of` do responsável, além das regras de hoje).
- Tirar alguém de um board: os cards dele naquele board ficam sem responsável, a não ser que ele
  continue com acesso (admin ou líder).
- Leitor pode estar em boards e continua só lendo.

## Outras regras que mudam

- `list`: insert e update para `admin`/`member` com acesso; delete só `can_manage_board`. Mudar
  `status` ou `wip_limit` sem `can_manage_board` é recusado por trigger. `set_list_positions` é
  security invoker, então segue o RLS.
- `board`: insert por `can_manage_team_boards`; update por `can_manage_board`; delete só admin;
  select por `board_role(id) is not null`.
- `board_member`: select para quem tem acesso ao board; insert/delete por `can_manage_board`; quem
  entra precisa ser da mesma equipe.
- `activity`: além da equipe, linhas de um board só para quem tem acesso a ele (`board_id is null
  or board_role(board_id) is not null`), para não vazar títulos de cards.
- `notification_team_for(board, user)` passa a exigir acesso ao board: quem perdeu o board não
  recebe avisos dele.

## Tela

- `CurrentTeamContext` ganha `isLeader` e `canManageBoards` (admin ou líder); `MyTeam` ganha
  `is_leader`.
- Lista de boards: criar e renomear para admin e líder; excluir só admin. Menu do board ganha
  "Pessoas do board" (admin e líder): lista da equipe com caixas de marcar; admin e líder aparecem
  como "vê todos os boards".
- Colunas: membro cria, renomeia e arrasta; o menu da coluna mostra tipo, limite e excluir só para
  admin e líder.
- Responsável do card: só pessoas com acesso ao board.

## Fora do escopo

Dashboard com dados reais (projeto 2). Papel diferente por board (o papel continua o da equipe).

## Testes

- `supabase/tests/0020_*_test.sql`: um líder por equipe e troca da coroa; membro não vê nem lê
  board de que não participa (cards, colunas, anexos, histórico, atividade); admin e líder veem
  tudo; membro cria, renomeia e reordena coluna mas não exclui nem muda tipo/limite; líder cria e
  renomeia board e escolhe pessoas, não exclui board; tirar do board desatribui; atribuir a quem
  não tem acesso falha; migração põe todos em todos os boards.
- Testes antigos que assumiam "membro não cria coluna" ou "membro vê todos os boards" são
  atualizados para a regra nova.
- e2e simulados: menu da coluna para membro, "Pessoas do board".
