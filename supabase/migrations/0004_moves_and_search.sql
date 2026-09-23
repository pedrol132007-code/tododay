-- Funções chamadas pelo app na E4. Todas rodam com as permissões de quem chama
-- (security invoker), então a RLS da 0003 continua valendo.

-- ─── Reordenar ────────────────────────────────────────────────────────────────
-- Grava várias posições numa transação só (rebalanceamento de src/lib/position.ts).
-- p_items: [{"id": 1, "position": 1}, ...]

create function public.set_card_positions(p_items jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.card c
  set position = (i ->> 'position')::double precision
  from jsonb_array_elements(p_items) i
  where c.id = (i ->> 'id')::bigint;
$$;

create function public.set_list_positions(p_items jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.list l
  set position = (i ->> 'position')::double precision
  from jsonb_array_elements(p_items) i
  where l.id = (i ->> 'id')::bigint;
$$;

-- ─── updated_at ───────────────────────────────────────────────────────────────
-- Relógio do servidor, igual para todo mundo. Mover/arquivar não conta como edição
-- (mesmo comportamento do SQLite).

create function public.touch_card_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger card_touch_updated_at
  before update of title, description, due_date on public.card
  for each row execute function public.touch_card_updated_at();

-- ─── Busca ────────────────────────────────────────────────────────────────────
-- Cards (título/descrição, não arquivados) e colunas dos boards de uma equipe.

create function public.search_team(p_team_id bigint, p_query text)
returns table (type text, id bigint, title text, board_id bigint, board_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  (
    select 'card', c.id, c.title, c.board_id, b.name
    from public.card c
    join public.board b on b.id = c.board_id
    where b.team_id = p_team_id
      and c.archived_at is null
      and (c.title ilike '%' || p_query || '%' or c.description ilike '%' || p_query || '%')
    order by c.updated_at desc
    limit 20
  )
  union all
  (
    select 'list', l.id, l.name, l.board_id, b.name
    from public.list l
    join public.board b on b.id = l.board_id
    where b.team_id = p_team_id
      and l.name ilike '%' || p_query || '%'
    order by l.name asc
    limit 10
  );
$$;

revoke execute on function public.set_card_positions(jsonb), public.set_list_positions(jsonb),
  public.search_team(bigint, text) from public, anon;
grant execute on function public.set_card_positions(jsonb), public.set_list_positions(jsonb),
  public.search_team(bigint, text) to authenticated;
