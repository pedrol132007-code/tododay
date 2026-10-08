-- Líder único e boards por pessoa (docs/superpowers/specs/2026-10-08-lider-unico-e-boards-por-pessoa-design.md).
--
-- 1. No máximo um líder por equipe: dar a coroa a alguém tira a do anterior.
-- 2. Cada board tem as suas pessoas (board_member). Admin e líder veem todos os boards da equipe;
--    membro e leitor, só aqueles em que estão. Tudo passa por board_role (agora board_role_of), que
--    toda a RLS de list, card, label, checklist, anexos, histórico, Storage e Realtime já usa.
-- 3. Membro cria, renomeia e reordena colunas. Excluir coluna, mudar tipo (status) ou limite
--    (wip_limit), criar e renomear board e escolher as pessoas de cada board: admin e líder.
--    Excluir board continua só do admin.

-- ─── Líder único ──────────────────────────────────────────────────────────────

-- Equipes com mais de um líder: fica quem ganhou a coroa por último (atividade member.leader_on,
-- que guarda o nome da época); sem registro, o primeiro por user_id.
with ranked as (
  select m.team_id, m.user_id,
    row_number() over (
      partition by m.team_id
      order by (
        select max(a.created_at) from public.activity a
        where a.team_id = m.team_id and a.action = 'member.leader_on'
          and a.payload->>'name' = public.display_name_of(m.user_id)
      ) desc nulls last, m.user_id
    ) as n
  from public.team_member m
  where m.is_leader
)
update public.team_member m set is_leader = false
from ranked r
where r.team_id = m.team_id and r.user_id = m.user_id and r.n > 1;

create unique index team_member_one_leader on public.team_member (team_id) where is_leader;

-- A coroa passa: antes de gravar o novo líder, tira a do anterior (o trigger de atividade da 0016
-- registra member.leader_off dele).
create function public.pass_the_crown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_leader and not old.is_leader then
    update public.team_member set is_leader = false
    where team_id = new.team_id and user_id <> new.user_id and is_leader;
  end if;
  return new;
end;
$$;

create trigger team_member_pass_the_crown
  before update of is_leader on public.team_member
  for each row execute function public.pass_the_crown();

-- ─── Pessoas do board ─────────────────────────────────────────────────────────

create table public.board_member (
  board_id bigint not null references public.board (id) on delete cascade,
  user_id uuid not null references public.profile (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

create index board_member_user on public.board_member (user_id);

-- Ninguém perde acesso no deploy: todo mundo da equipe (inclusive desativados, para reativar sem
-- perder nada) entra em todos os boards que já existem.
insert into public.board_member (board_id, user_id)
select b.id, m.user_id from public.board b join public.team_member m on m.team_id = b.team_id;

-- Acesso de uma pessoa a um board: o papel dela na equipe, se está ativa e é admin, líder ou está
-- no board; senão null.
create function public.board_role_of(p_board_id bigint, p_user_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.board b
  join public.team_member m on m.team_id = b.team_id and m.user_id = p_user_id and m.deactivated_at is null
  where b.id = p_board_id
    and (m.role = 'admin' or m.is_leader
         or exists (select 1 from public.board_member bm where bm.board_id = b.id and bm.user_id = p_user_id));
$$;

create or replace function public.board_role(p_board_id bigint)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select public.board_role_of(p_board_id, auth.uid());
$$;

-- Admin ou líder (ativo) da equipe: cria boards, escolhe as pessoas, mexe no tipo das colunas.
create function public.can_manage_team_boards(p_team_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_member m
    where m.team_id = p_team_id and m.user_id = auth.uid() and m.deactivated_at is null
      and (m.role = 'admin' or m.is_leader)
  );
$$;

create function public.can_manage_board(p_board_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.can_manage_team_boards(b.team_id) from public.board b where b.id = p_board_id), false);
$$;

-- can_manage_* aparecem nas políticas, então quem está logado precisa executar; board_role_of só é
-- chamada por funções security definer.
revoke execute on function public.can_manage_team_boards(bigint), public.can_manage_board(bigint) from public, anon;
revoke execute on function public.board_role_of(bigint, uuid), public.pass_the_crown() from public, anon, authenticated;

alter table public.board_member enable row level security;

create policy "board_member_select" on public.board_member
  for select to authenticated using (public.board_role(board_id) is not null);
create policy "board_member_insert" on public.board_member
  for insert to authenticated with check (
    public.can_manage_board(board_id)
    and exists (
      select 1 from public.board b join public.team_member m on m.team_id = b.team_id
      where b.id = board_id and m.user_id = board_member.user_id
    )
  );
create policy "board_member_delete" on public.board_member
  for delete to authenticated using (public.can_manage_board(board_id));

revoke all on public.board_member from anon;
revoke update, truncate on public.board_member from authenticated;

-- Quem cria o board entra nele: se depois perder a coroa, continua vendo o que criou.
create function public.board_add_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.board_member (board_id, user_id) values (new.id, auth.uid())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger board_add_creator
  after insert on public.board
  for each row execute function public.board_add_creator();

-- Saiu do board: os cards dele ali ficam sem responsável, a não ser que continue vendo o board
-- (admin ou líder). Board ou conta sendo apagados: cascata, nada a fazer.
create function public.board_member_unassign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.board b where b.id = old.board_id)
     or not exists (select 1 from public.profile p where p.id = old.user_id) then
    return old;
  end if;
  if public.board_role_of(old.board_id, old.user_id) is null then
    update public.card set assignee_id = null
    where board_id = old.board_id and assignee_id = old.user_id;
  end if;
  return old;
end;
$$;

create trigger board_member_unassign
  after delete on public.board_member
  for each row execute function public.board_member_unassign();

-- Saiu da equipe: sai dos boards dela também (os cards já são desatribuídos pela 0008).
create function public.team_member_leave_boards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.board_member bm
  using public.board b
  where b.id = bm.board_id and b.team_id = old.team_id and bm.user_id = old.user_id;
  return old;
end;
$$;

create trigger team_member_leave_boards
  after delete on public.team_member
  for each row execute function public.team_member_leave_boards();

revoke execute on function
  public.board_add_creator(),
  public.board_member_unassign(),
  public.team_member_leave_boards()
from public, anon, authenticated;

-- ─── Board ────────────────────────────────────────────────────────────────────

drop policy "board_select" on public.board;
drop policy "board_insert" on public.board;
drop policy "board_update" on public.board;
create policy "board_select" on public.board
  for select to authenticated using (public.board_role(id) is not null);
create policy "board_insert" on public.board
  for insert to authenticated with check (public.can_manage_team_boards(team_id));
create policy "board_update" on public.board
  for update to authenticated
  using (public.can_manage_board(id))
  with check (public.can_manage_board(id));
-- board_delete continua: só admin (0003).

-- ─── Colunas ──────────────────────────────────────────────────────────────────

drop policy "list_insert" on public.list;
drop policy "list_update" on public.list;
drop policy "list_delete" on public.list;
create policy "list_insert" on public.list
  for insert to authenticated with check (public.board_role(board_id) in ('admin', 'member'));
create policy "list_update" on public.list
  for update to authenticated
  using (public.board_role(board_id) in ('admin', 'member'))
  with check (public.board_role(board_id) in ('admin', 'member'));
create policy "list_delete" on public.list
  for delete to authenticated using (public.can_manage_board(board_id));

-- Tipo e limite mexem nos números do dashboard: só admin e líder. Coluna nova de membro nasce
-- com o tipo padrão e sem limite.
create function public.protect_list_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.can_manage_board(new.board_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'todo' or new.wip_limit is not null then
      raise exception 'Só o admin ou o líder escolhe o tipo e o limite da coluna';
    end if;
  elsif new.status is distinct from old.status or new.wip_limit is distinct from old.wip_limit then
    raise exception 'Só o admin ou o líder muda o tipo e o limite da coluna';
  end if;
  return new;
end;
$$;

create trigger list_protect_settings
  before insert or update of status, wip_limit on public.list
  for each row execute function public.protect_list_settings();

revoke execute on function public.protect_list_settings() from public, anon, authenticated;

-- ─── Responsável ──────────────────────────────────────────────────────────────

-- Além das regras de 0013: só quem vê o board. Card que muda de board perde o responsável que não
-- vê o board novo (em vez de travar a mudança).
create or replace function public.validate_card_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deactivated timestamptz;
begin
  if new.assignee_id is null then
    return new;
  end if;
  select m.deactivated_at into v_deactivated
  from public.board b
  join public.team_member m on m.team_id = b.team_id
  where b.id = new.board_id and m.user_id = new.assignee_id;
  if not found then
    raise exception 'O responsável precisa ser membro da equipe';
  end if;
  if v_deactivated is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    raise exception 'Essa pessoa está desativada na equipe';
  end if;
  if v_deactivated is null and public.board_role_of(new.board_id, new.assignee_id) is null then
    if tg_op = 'UPDATE' and new.assignee_id = old.assignee_id and new.board_id is distinct from old.board_id then
      new.assignee_id := null;
    elsif tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
      raise exception 'Essa pessoa não participa deste board';
    end if;
  end if;
  return new;
end;
$$;

-- ─── Atividade e notificações ─────────────────────────────────────────────────

-- O que aconteceu num board só aparece para quem vê o board (o payload tem títulos de cards).
drop policy "activity_select" on public.activity;
create policy "activity_select" on public.activity
  for select to authenticated using (
    public.team_role(team_id) is not null and (board_id is null or public.board_role(board_id) is not null)
  );

-- Quem não vê o board não recebe avisos dele.
create or replace function public.notification_team_for(p_board_id bigint, p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select b.team_id from public.board b
  join public.team_member m on m.team_id = b.team_id and m.user_id = p_user_id
  where b.id = p_board_id and m.deactivated_at is null and m.role <> 'viewer'
    and public.board_role_of(p_board_id, p_user_id) is not null;
$$;

-- Entrar ou sair de um board atualiza a lista de boards de quem está aberto.
alter publication supabase_realtime add table public.board_member;
