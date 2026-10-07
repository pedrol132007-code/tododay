-- Notificações (docs/superpowers/specs/2026-10-07-lider-e-notificacoes-design.md).
--
-- Cada linha é de uma pessoa (user_id) e só ela lê e marca como lida. Ninguém insere pelo
-- cliente: triggers em card e card_attachment e o job diário (pg_cron) geram tudo.
--   assigned  — alguém pôs a pessoa como responsável de um card
--   changed   — outra pessoa mudou prazo, descrição, coluna ou anexou arquivo num card dela;
--               enquanto não lida, mudanças novas do mesmo card entram na mesma linha
--   due_3d / due_1d / overdue — avisos de prazo, uma vez por card, tipo e prazo (due_key)
-- payload guarda o que a lista mostra, com os nomes da época.
-- Não recebem: leitor, desativado, card arquivado, e quem fez a ação.

create table public.notification (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profile (id) on delete cascade,
  team_id bigint not null references public.team (id) on delete cascade,
  board_id bigint references public.board (id) on delete set null,
  card_id bigint references public.card (id) on delete set null,
  actor_id uuid references public.profile (id) on delete set null,
  kind text not null check (kind in ('assigned', 'due_3d', 'due_1d', 'overdue', 'changed')),
  -- O prazo que gerou o aviso: mudou o prazo, pode avisar de novo.
  due_key date,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz
);

create index idx_notification_user on public.notification (user_id, team_id, updated_at desc);
create unique index idx_notification_due_once on public.notification (user_id, card_id, kind, due_key)
  where kind in ('due_3d', 'due_1d', 'overdue');
create unique index idx_notification_one_unread_change on public.notification (user_id, card_id)
  where kind = 'changed' and read_at is null;

alter table public.notification enable row level security;

create policy "notification_select_own" on public.notification
  for select to authenticated using (user_id = auth.uid());
create policy "notification_update_own" on public.notification
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.notification from anon;
revoke insert, update, delete on public.notification from authenticated;
grant update (read_at) on public.notification to authenticated;

-- ─── Peças comuns ─────────────────────────────────────────────────────────────

-- Equipe do board, se a pessoa pode receber ali (ativa e não leitora); senão null.
create function public.notification_team_for(p_board_id bigint, p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select b.team_id from public.board b
  join public.team_member m on m.team_id = b.team_id and m.user_id = p_user_id
  where b.id = p_board_id and m.deactivated_at is null and m.role <> 'viewer';
$$;

create function public.notification_card_payload(p_card public.card, p_team_id bigint, p_actor uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'card_title', p_card.title,
    'board_name', (select b.name from public.board b where b.id = p_card.board_id),
    'actor_name', public.display_name_of(p_actor),
    'actor_was_leader', coalesce((select m.is_leader from public.team_member m
                                  where m.team_id = p_team_id and m.user_id = p_actor), false),
    'due_date', p_card.due_date);
$$;

-- Mudança feita por p_actor no card de outra pessoa. Logo depois de uma atribuição ainda não lida
-- (1 minuto), o ajuste entra nela; senão, junta na mudança não lida do card ou cria outra.
create function public.notify_card_changed(
  p_card public.card, p_team_id bigint, p_actor uuid, p_changes text[], p_attachments int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_payload jsonb;
begin
  update public.notification n
  set payload = n.payload || jsonb_build_object('card_title', p_card.title, 'due_date', p_card.due_date),
      updated_at = now()
  where n.user_id = p_card.assignee_id and n.card_id = p_card.id and n.kind = 'assigned'
    and n.read_at is null and n.created_at > now() - interval '1 minute';
  if found then
    return;
  end if;

  select n.id, n.payload into v_id, v_payload from public.notification n
  where n.user_id = p_card.assignee_id and n.card_id = p_card.id and n.kind = 'changed' and n.read_at is null
  for update;

  if found then
    update public.notification
    set actor_id = p_actor,
        payload = v_payload || public.notification_card_payload(p_card, p_team_id, p_actor) || jsonb_build_object(
          'changes', (select jsonb_agg(distinct c) from (
                        select jsonb_array_elements_text(coalesce(v_payload->'changes', '[]')) c
                        union select unnest(p_changes)) s),
          'attachments', coalesce((v_payload->>'attachments')::int, 0) + p_attachments,
          'list_name', (select l.name from public.list l where l.id = p_card.list_id)),
        updated_at = now()
    where id = v_id;
  else
    insert into public.notification (user_id, team_id, board_id, card_id, actor_id, kind, payload)
    values (p_card.assignee_id, p_team_id, p_card.board_id, p_card.id, p_actor, 'changed',
      public.notification_card_payload(p_card, p_team_id, p_actor) || jsonb_build_object(
        'changes', to_jsonb(p_changes),
        'attachments', p_attachments,
        'list_name', (select l.name from public.list l where l.id = p_card.list_id)));
  end if;
end;
$$;

-- ─── Avisos de prazo ──────────────────────────────────────────────────────────

-- Faltam 2–3 dias: due_3d. Falta 1: due_1d. Venceu há 1–3 dias: overdue (sai no dia seguinte e
-- tolera o job falhar um ou dois dias, sem despejar avisos de cards vencidos há meses).
create function public.notify_due_for_card(
  p_card_id bigint, p_today date default (now() at time zone 'America/Sao_Paulo')::date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.card;
  v_team bigint;
  v_days int;
  v_kind text;
begin
  select * into v_card from public.card c where c.id = p_card_id;
  if not found or v_card.archived_at is not null or v_card.assignee_id is null or v_card.due_date is null then
    return;
  end if;
  if (select l.status from public.list l where l.id = v_card.list_id) = 'done' then
    return;
  end if;
  v_team := public.notification_team_for(v_card.board_id, v_card.assignee_id);
  if v_team is null then
    return;
  end if;
  v_days := v_card.due_date - p_today;
  v_kind := case
    when v_days between -3 and -1 then 'overdue'
    when v_days = 1 then 'due_1d'
    when v_days between 2 and 3 then 'due_3d'
  end;
  if v_kind is null then
    return;
  end if;
  insert into public.notification (user_id, team_id, board_id, card_id, kind, due_key, payload)
  values (v_card.assignee_id, v_team, v_card.board_id, v_card.id, v_kind, v_card.due_date,
    public.notification_card_payload(v_card, v_team, null) || jsonb_build_object('days_left', v_days))
  on conflict (user_id, card_id, kind, due_key) where kind in ('due_3d', 'due_1d', 'overdue') do nothing;
end;
$$;

-- Job diário: avisos de todos os cards perto do prazo e limpeza das lidas há mais de 90 dias.
create function public.notify_due_dates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id bigint;
begin
  for v_id in
    select c.id from public.card c join public.list l on l.id = c.list_id
    where c.archived_at is null and c.assignee_id is not null and l.status <> 'done'
      and c.due_date between v_today - 3 and v_today + 3
  loop
    perform public.notify_due_for_card(v_id, v_today);
  end loop;
  delete from public.notification where read_at < now() - interval '90 days';
end;
$$;

-- ─── Triggers ─────────────────────────────────────────────────────────────────

create function public.card_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_team bigint;
  v_changes text[] := '{}';
begin
  if new.assignee_id is null or new.archived_at is not null then
    return new;
  end if;
  -- Prazo perto: avisa já (quem recebe um card que vence em 2 dias não espera o job).
  if tg_op = 'INSERT' or new.due_date is distinct from old.due_date or new.assignee_id is distinct from old.assignee_id then
    perform public.notify_due_for_card(new.id);
  end if;
  if v_actor is null or v_actor = new.assignee_id then
    return new;
  end if;
  v_team := public.notification_team_for(new.board_id, new.assignee_id);
  if v_team is null then
    return new;
  end if;

  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    insert into public.notification (user_id, team_id, board_id, card_id, actor_id, kind, payload)
    values (new.assignee_id, v_team, new.board_id, new.id, v_actor, 'assigned',
      public.notification_card_payload(new, v_team, v_actor));
    return new;
  end if;

  if new.due_date is distinct from old.due_date then v_changes := v_changes || 'due_date'::text; end if;
  if new.description is distinct from old.description then v_changes := v_changes || 'description'::text; end if;
  if new.list_id is distinct from old.list_id then v_changes := v_changes || 'list'::text; end if;
  if cardinality(v_changes) > 0 then
    perform public.notify_card_changed(new, v_team, v_actor, v_changes, 0);
  end if;
  return new;
end;
$$;

create trigger card_notify
  after insert or update of assignee_id, due_date, description, list_id, archived_at on public.card
  for each row execute function public.card_notifications();

-- Anexo novo: quem enviou é uploaded_by (a Edge Function grava com service_role, sem auth.uid()).
create function public.card_attachment_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.card;
  v_team bigint;
begin
  select * into v_card from public.card c where c.id = new.card_id;
  if v_card.assignee_id is null or v_card.archived_at is not null
     or new.uploaded_by is null or new.uploaded_by = v_card.assignee_id then
    return new;
  end if;
  v_team := public.notification_team_for(v_card.board_id, v_card.assignee_id);
  if v_team is null then
    return new;
  end if;
  perform public.notify_card_changed(v_card, v_team, new.uploaded_by, array['attachments'], 1);
  return new;
end;
$$;

create trigger card_attachment_notify
  after insert on public.card_attachment
  for each row execute function public.card_attachment_notifications();

revoke execute on function
  public.notification_team_for(bigint, uuid),
  public.notification_card_payload(public.card, bigint, uuid),
  public.notify_card_changed(public.card, bigint, uuid, text[], int),
  public.notify_due_for_card(bigint, date),
  public.notify_due_dates()
from public, anon, authenticated;

-- ─── Realtime e agendamento ───────────────────────────────────────────────────

alter publication supabase_realtime add table public.notification;

-- Todo dia às 11:00 UTC (8h de Brasília). Onde não houver pg_cron, os testes chamam a função direto.
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('tododay-avisos-de-prazo', '0 11 * * *', 'select public.notify_due_dates()');
  end if;
end;
$do$;
