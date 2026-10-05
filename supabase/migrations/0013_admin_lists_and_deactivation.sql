-- Papéis do piloto e desativação de membros.
--
-- 1. Estrutura do board é do admin: criar, renomear, reordenar e excluir colunas (e o tipo e o
--    limite de WIP delas) e criar ou renomear boards. Membros usam o board: cards, etiquetas,
--    checklist, anexos. Viewer continua só lendo.
-- 2. Desativar membro: team_member.deactivated_at. Quem está desativado perde o acesso à equipe
--    inteira (team_role e board_role passam a ignorá-lo, e tudo, inclusive anexos, passa por elas),
--    mas continua na tabela: os cards seguem com ele como responsável e o histórico guarda o nome.
--    Remover (delete) continua existindo e desatribui os cards, como antes.

-- ─── Desativação ──────────────────────────────────────────────────────────────

alter table public.team_member add column deactivated_at timestamptz;

create or replace function public.team_role(p_team_id bigint)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.team_member m
  where m.team_id = p_team_id and m.user_id = auth.uid() and m.deactivated_at is null;
$$;

create or replace function public.board_role(p_board_id bigint)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.board b
  join public.team_member m on m.team_id = b.team_id and m.user_id = auth.uid() and m.deactivated_at is null
  where b.id = p_board_id;
$$;

-- Perfis: quem está ativo vê os colegas, inclusive os desativados (o nome continua nos cards).
create or replace function public.shares_team_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_member mine
    join public.team_member theirs on theirs.team_id = mine.team_id
    where mine.user_id = auth.uid() and mine.deactivated_at is null and theirs.user_id = p_user_id
  );
$$;

-- Último admin: a equipe precisa de pelo menos um admin ATIVO, e ninguém se desativa sozinho.
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leaving boolean;
begin
  if tg_op = 'UPDATE' and new.deactivated_at is not null and old.deactivated_at is null
     and new.user_id = auth.uid() then
    raise exception 'Você não pode desativar a si mesmo';
  end if;
  if old.role <> 'admin' or old.deactivated_at is not null then
    return coalesce(new, old);
  end if;
  -- Deixa de ser admin ativo: sai, perde o papel ou é desativado.
  v_leaving := tg_op = 'DELETE' or new.role <> 'admin' or new.deactivated_at is not null;
  if not v_leaving then
    return new;
  end if;
  -- Apagar a equipe (ou a conta) apaga os membros em cascata: aí não há o que proteger.
  if not exists (select 1 from public.team t where t.id = old.team_id)
     or not exists (select 1 from public.profile p where p.id = old.user_id) then
    return coalesce(new, old);
  end if;
  if not exists (
    select 1 from public.team_member m
    where m.team_id = old.team_id and m.role = 'admin' and m.deactivated_at is null and m.user_id <> old.user_id
  ) then
    raise exception 'A equipe precisa de pelo menos um admin ativo';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger team_member_protect_last_admin on public.team_member;
create trigger team_member_protect_last_admin
  before update of role, deactivated_at or delete on public.team_member
  for each row execute function public.protect_last_admin();

-- Responsável: continua precisando ser da equipe; ninguém novo recebe um card de quem está
-- desativado, mas os cards que já eram dele seguem andando normalmente.
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
  return new;
end;
$$;

-- ─── Estrutura do board só para admin ─────────────────────────────────────────

drop policy "list_write" on public.list;
create policy "list_insert" on public.list
  for insert to authenticated with check (public.board_role(board_id) = 'admin');
create policy "list_update" on public.list
  for update to authenticated
  using (public.board_role(board_id) = 'admin')
  with check (public.board_role(board_id) = 'admin');
create policy "list_delete" on public.list
  for delete to authenticated using (public.board_role(board_id) = 'admin');

drop policy "board_insert" on public.board;
drop policy "board_update" on public.board;
create policy "board_insert" on public.board
  for insert to authenticated with check (public.team_role(team_id) = 'admin');
create policy "board_update" on public.board
  for update to authenticated
  using (public.team_role(team_id) = 'admin')
  with check (public.team_role(team_id) = 'admin');

-- Só o admin pode desativar (policy team_member_update); a coluna precisa do grant, como role e job_title.
grant update (deactivated_at) on public.team_member to authenticated;

-- ─── Histórico da equipe: desativar e reativar ────────────────────────────────

create or replace function public.team_member_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.team_member := coalesce(new, old);
  v_name text := public.display_name_of(v_member.user_id);
begin
  -- Conta sendo apagada: é cascata.
  if v_name is null then
    return v_member;
  end if;
  if tg_op = 'INSERT' then
    perform public.log_activity(new.team_id, null, null, 'member.joined',
      jsonb_build_object('name', v_name, 'role', new.role));
  elsif tg_op = 'DELETE' then
    perform public.log_activity(old.team_id, null, null,
      case when old.user_id = auth.uid() then 'member.left' else 'member.removed' end,
      jsonb_build_object('name', v_name));
  else
    if new.role is distinct from old.role then
      perform public.log_activity(new.team_id, null, null, 'member.role_changed',
        jsonb_build_object('name', v_name, 'from', old.role, 'to', new.role));
    end if;
    if new.job_title is distinct from old.job_title then
      perform public.log_activity(new.team_id, null, null, 'member.job_title_changed',
        jsonb_build_object('name', v_name, 'to', new.job_title));
    end if;
    if (new.deactivated_at is null) is distinct from (old.deactivated_at is null) then
      perform public.log_activity(new.team_id, null, null,
        case when new.deactivated_at is null then 'member.reactivated' else 'member.deactivated' end,
        jsonb_build_object('name', v_name));
    end if;
  end if;
  return v_member;
end;
$$;

drop trigger team_member_log_activity on public.team_member;
create trigger team_member_log_activity
  after insert or delete or update of role, job_title, deactivated_at on public.team_member
  for each row execute function public.team_member_activity();
