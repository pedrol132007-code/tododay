-- Só o líder vê todos os boards (0020 dava isso também ao admin). O admin entra nos boards como
-- qualquer pessoa, pela lista "Pessoas do board", e continua com os poderes de gestão (criar board,
-- escolher pessoas, tipo/limite/excluir coluna, excluir board) nos boards que vê.

-- Ninguém perde acesso no deploy: admins entram em todos os boards da equipe que existem hoje.
insert into public.board_member (board_id, user_id)
select b.id, m.user_id from public.board b
join public.team_member m on m.team_id = b.team_id and m.role = 'admin'
on conflict do nothing;

create or replace function public.board_role_of(p_board_id bigint, p_user_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.board b
  join public.team_member m on m.team_id = b.team_id and m.user_id = p_user_id and m.deactivated_at is null
  where b.id = p_board_id
    and (m.is_leader
         or exists (select 1 from public.board_member bm where bm.board_id = b.id and bm.user_id = p_user_id));
$$;

-- Admin e líder também enxergam (só o board, não o conteúdo) um board sem ninguém: é o caso do board
-- recém-criado no insert ... returning, antes de board_add_creator pôr quem criou nele, e de um board
-- de que tiraram todo mundo, que assim nunca fica perdido (o admin se põe de volta em Pessoas do board).
create or replace function public.sees_board(p_team_id bigint, p_board_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_member m
    where m.team_id = p_team_id and m.user_id = auth.uid() and m.deactivated_at is null
      and (m.is_leader
           or exists (select 1 from public.board_member bm where bm.board_id = p_board_id and bm.user_id = auth.uid())
           or (m.role = 'admin' and not exists (select 1 from public.board_member bm where bm.board_id = p_board_id)))
  );
$$;
