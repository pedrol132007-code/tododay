-- Aviso de prazo na hora só quando outra pessoa definiu o prazo ou atribuiu o card (0017).
--
-- Quem põe prazo no próprio card já sabe dele: não recebe "Vence em N dias" de si mesmo. O job
-- diário (notify_due_dates, 8h de Brasília) continua avisando normalmente nos dias seguintes.
-- Sem auth.uid() (script, service_role), segue avisando na hora, como antes.

create or replace function public.card_notifications()
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
  if (tg_op = 'INSERT' or new.due_date is distinct from old.due_date or new.assignee_id is distinct from old.assignee_id)
     and v_actor is distinct from new.assignee_id then
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
