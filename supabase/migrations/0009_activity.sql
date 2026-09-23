-- E9: histórico de atividade, preenchido só por triggers (o app nunca escreve aqui).
--
-- payload guarda os nomes da época ("moveu de A fazer para Feito"), para o histórico
-- continuar legível depois de renomear ou apagar coisas. actor_name idem: quem saiu da
-- equipe deixa de aparecer em profile para os outros, mas o nome fica no histórico.
--
-- Só registra ações de usuários logados (auth.uid()). Mudanças em cascata de algo que
-- está sendo apagado (equipe, board, card) não geram entradas próprias.

create table public.activity (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.team (id) on delete cascade,
  board_id bigint references public.board (id) on delete set null,
  card_id bigint references public.card (id) on delete set null,
  actor_id uuid references public.profile (id) on delete set null,
  actor_name text not null,
  action text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_activity_team on public.activity (team_id, created_at desc);
create index idx_activity_card on public.activity (card_id, created_at desc);

alter table public.activity enable row level security;

create policy "activity_select" on public.activity
  for select to authenticated using (public.team_role(team_id) is not null);
revoke all on public.activity from anon;
revoke insert, update, delete on public.activity from authenticated;

-- ─── Registrar ────────────────────────────────────────────────────────────────

create function public.log_activity(
  p_team_id bigint,
  p_board_id bigint,
  p_card_id bigint,
  p_action text,
  p_payload jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_team_id is null then
    return;
  end if;
  -- Equipe ou board sendo apagados: é cascata, não registra.
  if not exists (select 1 from public.team t where t.id = p_team_id) then
    return;
  end if;
  if p_board_id is not null and not exists (select 1 from public.board b where b.id = p_board_id) then
    return;
  end if;
  insert into public.activity (team_id, board_id, card_id, actor_id, actor_name, action, payload)
  values (
    p_team_id, p_board_id, p_card_id, auth.uid(),
    coalesce((select p.display_name from public.profile p where p.id = auth.uid()), '?'),
    p_action, p_payload
  );
end;
$$;

revoke execute on function public.log_activity(bigint, bigint, bigint, text, jsonb) from public, anon, authenticated;

create function public.display_name_of(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.display_name from public.profile p where p.id = p_user_id;
$$;

revoke execute on function public.display_name_of(uuid) from public, anon, authenticated;

-- ─── Cards ────────────────────────────────────────────────────────────────────

create function public.card_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team bigint;
begin
  if tg_op = 'DELETE' then
    select b.team_id into v_team from public.board b where b.id = old.board_id;
    perform public.log_activity(v_team, old.board_id, null, 'card.deleted', jsonb_build_object('title', old.title));
    return old;
  end if;

  select b.team_id into v_team from public.board b where b.id = new.board_id;

  if tg_op = 'INSERT' then
    perform public.log_activity(v_team, new.board_id, new.id, 'card.created', jsonb_build_object(
      'title', new.title, 'list', (select l.name from public.list l where l.id = new.list_id)));
    return new;
  end if;

  if new.title is distinct from old.title then
    perform public.log_activity(v_team, new.board_id, new.id, 'card.renamed',
      jsonb_build_object('title', new.title, 'from', old.title));
  end if;
  if new.list_id is distinct from old.list_id then
    perform public.log_activity(v_team, new.board_id, new.id, 'card.moved', jsonb_build_object(
      'title', new.title,
      'from', (select l.name from public.list l where l.id = old.list_id),
      'to', (select l.name from public.list l where l.id = new.list_id)));
  end if;
  if new.description is distinct from old.description then
    perform public.log_activity(v_team, new.board_id, new.id, 'card.description_changed',
      jsonb_build_object('title', new.title));
  end if;
  if new.due_date is distinct from old.due_date then
    perform public.log_activity(v_team, new.board_id, new.id, 'card.due_date_changed',
      jsonb_build_object('title', new.title, 'to', new.due_date));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    if new.assignee_id is null then
      perform public.log_activity(v_team, new.board_id, new.id, 'card.unassigned',
        jsonb_build_object('title', new.title, 'name', public.display_name_of(old.assignee_id)));
    else
      perform public.log_activity(v_team, new.board_id, new.id, 'card.assigned',
        jsonb_build_object('title', new.title, 'name', public.display_name_of(new.assignee_id)));
    end if;
  end if;
  if old.archived_at is null and new.archived_at is not null then
    perform public.log_activity(v_team, new.board_id, new.id, 'card.archived', jsonb_build_object('title', new.title));
  elsif old.archived_at is not null and new.archived_at is null then
    perform public.log_activity(v_team, new.board_id, new.id, 'card.restored', jsonb_build_object('title', new.title));
  end if;
  return new;
end;
$$;

-- Mudar só a posição (arrastar na mesma coluna, rebalancear) não entra no histórico.
create trigger card_log_activity
  after insert or delete or update of title, list_id, description, due_date, assignee_id, archived_at
  on public.card
  for each row execute function public.card_activity();

-- ─── Checklist e labels do card ───────────────────────────────────────────────

create function public.checklist_item_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.checklist_item := coalesce(new, old);
  v_card public.card;
  v_action text;
begin
  -- Card sendo apagado: é cascata.
  select * into v_card from public.card c where c.id = v_item.card_id;
  if not found then
    return v_item;
  end if;
  v_action := case
    when tg_op = 'INSERT' then 'checklist.added'
    when tg_op = 'DELETE' then 'checklist.removed'
    when new.done then 'checklist.checked'
    else 'checklist.unchecked'
  end;
  perform public.log_activity(
    (select b.team_id from public.board b where b.id = v_card.board_id), v_card.board_id, v_card.id, v_action,
    jsonb_build_object('title', v_card.title, 'item', v_item.text));
  return v_item;
end;
$$;

create trigger checklist_item_log_activity
  after insert or delete or update of done on public.checklist_item
  for each row execute function public.checklist_item_activity();

create function public.card_label_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.card_label := coalesce(new, old);
  v_card public.card;
  v_label text;
begin
  select * into v_card from public.card c where c.id = v_row.card_id;
  select l.name into v_label from public.label l where l.id = v_row.label_id;
  -- Card ou label sendo apagados: é cascata.
  if v_card.id is null or v_label is null then
    return v_row;
  end if;
  perform public.log_activity(
    (select b.team_id from public.board b where b.id = v_card.board_id), v_card.board_id, v_card.id,
    case when tg_op = 'INSERT' then 'label.added' else 'label.removed' end,
    jsonb_build_object('title', v_card.title, 'label', v_label));
  return v_row;
end;
$$;

create trigger card_label_log_activity
  after insert or delete on public.card_label
  for each row execute function public.card_label_activity();

-- ─── Boards e colunas ─────────────────────────────────────────────────────────

create function public.list_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.list := coalesce(new, old);
begin
  perform public.log_activity(
    (select b.team_id from public.board b where b.id = v_list.board_id), v_list.board_id, null,
    case tg_op when 'INSERT' then 'list.created' when 'DELETE' then 'list.deleted' else 'list.renamed' end,
    jsonb_build_object('name', v_list.name, 'from', case when tg_op = 'UPDATE' then old.name end,
      'board', (select b.name from public.board b where b.id = v_list.board_id)));
  return v_list;
end;
$$;

create trigger list_log_activity
  after insert or delete or update of name on public.list
  for each row execute function public.list_activity();

create function public.board_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_board public.board := coalesce(new, old);
begin
  perform public.log_activity(
    v_board.team_id, case when tg_op = 'DELETE' then null else v_board.id end, null,
    case tg_op when 'INSERT' then 'board.created' when 'DELETE' then 'board.deleted' else 'board.renamed' end,
    jsonb_build_object('name', v_board.name, 'from', case when tg_op = 'UPDATE' then old.name end));
  return v_board;
end;
$$;

create trigger board_log_activity
  after insert or delete or update of name on public.board
  for each row execute function public.board_activity();

-- ─── Equipe ───────────────────────────────────────────────────────────────────

create function public.team_member_activity()
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
  end if;
  return v_member;
end;
$$;

create trigger team_member_log_activity
  after insert or delete or update of role, job_title on public.team_member
  for each row execute function public.team_member_activity();

create function public.team_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_activity(new.id, null, null, 'team.renamed',
    jsonb_build_object('name', new.name, 'from', old.name));
  return new;
end;
$$;

create trigger team_log_activity
  after update of name on public.team
  for each row
  when (old.name is distinct from new.name)
  execute function public.team_activity();

create function public.team_invite_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.team_id, null, null, 'invite.created',
      jsonb_build_object('label', new.label, 'role', new.role));
  elsif old.revoked_at is null and new.revoked_at is not null then
    perform public.log_activity(new.team_id, null, null, 'invite.revoked', jsonb_build_object('label', new.label));
  end if;
  return new;
end;
$$;

create trigger team_invite_log_activity
  after insert or update of revoked_at on public.team_invite
  for each row execute function public.team_invite_activity();

-- Atualiza o histórico aberto na tela de quem estiver vendo (E7).
alter publication supabase_realtime add table public.activity;
