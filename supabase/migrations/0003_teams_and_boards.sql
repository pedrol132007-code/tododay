-- Equipes, membros e o schema do kanban (espelho de src-tauri/migrations/0001_init.sql),
-- com acesso definido pela equipe inteira via RLS.
--
-- Permissões:
--   viewer → lê tudo da equipe
--   member → lê e edita boards, colunas, cards, labels e checklist
--   admin  → tudo do member + apagar boards, renomear/apagar a equipe e gerenciar membros

create type public.member_role as enum ('admin', 'member', 'viewer');

create table public.team (
  id bigint generated always as identity primary key,
  name text not null,
  created_by uuid references public.profile (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.team_member (
  team_id bigint not null references public.team (id) on delete cascade,
  user_id uuid not null references public.profile (id) on delete cascade,
  role public.member_role not null,
  job_title text not null default '',
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index idx_team_member_user on public.team_member (user_id);

create table public.board (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.team (id) on delete cascade,
  name text not null,
  position double precision not null,
  created_at timestamptz not null default now()
);

create table public.list (
  id bigint generated always as identity primary key,
  board_id bigint not null references public.board (id) on delete cascade,
  name text not null,
  position double precision not null,
  wip_limit integer
);

create table public.card (
  id bigint generated always as identity primary key,
  list_id bigint not null references public.list (id) on delete cascade,
  -- Desnormalizado (preenchido por trigger a partir de list_id) para RLS e filtro do Realtime.
  board_id bigint not null references public.board (id) on delete cascade,
  title text not null,
  description text not null default '',
  position double precision not null,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.label (
  id bigint generated always as identity primary key,
  board_id bigint not null references public.board (id) on delete cascade,
  name text not null,
  color text not null
);

create table public.card_label (
  card_id bigint not null references public.card (id) on delete cascade,
  label_id bigint not null references public.label (id) on delete cascade,
  primary key (card_id, label_id)
);

create table public.checklist_item (
  id bigint generated always as identity primary key,
  card_id bigint not null references public.card (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  position double precision not null
);

create index idx_board_team on public.board (team_id);
create index idx_list_board on public.list (board_id);
create index idx_card_list on public.card (list_id);
create index idx_card_board on public.card (board_id);
create index idx_card_archived on public.card (archived_at);
create index idx_label_board on public.label (board_id);
create index idx_card_label_label on public.card_label (label_id);
create index idx_checklist_card on public.checklist_item (card_id);

-- ─── card.board_id ────────────────────────────────────────────────────────────
-- Roda com as permissões de quem escreve: uma coluna que o usuário não enxerga
-- vira board_id nulo e o insert/update falha.

create function public.set_card_board_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.board_id := (select l.board_id from public.list l where l.id = new.list_id);
  return new;
end;
$$;

create trigger card_set_board_id
  before insert or update of list_id on public.card
  for each row execute function public.set_card_board_id();

-- Coluna não troca de board; se trocasse, card.board_id ficaria desatualizado.
create function public.forbid_list_board_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.board_id <> old.board_id then
    raise exception 'Uma coluna não pode mudar de board';
  end if;
  return new;
end;
$$;

create trigger list_forbid_board_change
  before update of board_id on public.list
  for each row execute function public.forbid_list_board_change();

-- ─── Funções de permissão ─────────────────────────────────────────────────────
-- security definer: leem team_member/board sem passar pela RLS (evita recursão).

create function public.team_role(p_team_id bigint)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.team_member m
  where m.team_id = p_team_id and m.user_id = auth.uid();
$$;

create function public.board_role(p_board_id bigint)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.board b
  join public.team_member m on m.team_id = b.team_id and m.user_id = auth.uid()
  where b.id = p_board_id;
$$;

create function public.card_role(p_card_id bigint)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select public.board_role(c.board_id) from public.card c where c.id = p_card_id;
$$;

create function public.shares_team_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_member mine
    join public.team_member theirs on theirs.team_id = mine.team_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

-- ─── Criar equipe ─────────────────────────────────────────────────────────────
-- Única forma de criar equipe: cria e já coloca quem chamou como admin.

create function public.create_team(p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Precisa estar logado';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'O nome da equipe não pode ficar vazio';
  end if;
  insert into public.team (name, created_by) values (trim(p_name), auth.uid())
  returning id into v_team_id;
  insert into public.team_member (team_id, user_id, role) values (v_team_id, auth.uid(), 'admin');
  return v_team_id;
end;
$$;

revoke execute on function public.create_team(text) from public, anon;
grant execute on function public.create_team(text) to authenticated;

-- ─── Último admin ─────────────────────────────────────────────────────────────

create function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'admin' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' then
    return new;
  end if;
  -- Apagar a equipe (ou a conta) apaga os membros em cascata: aí não há o que proteger.
  if not exists (select 1 from public.team t where t.id = old.team_id)
     or not exists (select 1 from public.profile p where p.id = old.user_id) then
    return coalesce(new, old);
  end if;
  if not exists (
    select 1 from public.team_member m
    where m.team_id = old.team_id and m.role = 'admin' and m.user_id <> old.user_id
  ) then
    raise exception 'A equipe precisa de pelo menos um admin';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger team_member_protect_last_admin
  before update of role or delete on public.team_member
  for each row execute function public.protect_last_admin();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.team enable row level security;
alter table public.team_member enable row level security;
alter table public.board enable row level security;
alter table public.list enable row level security;
alter table public.card enable row level security;
alter table public.label enable row level security;
alter table public.card_label enable row level security;
alter table public.checklist_item enable row level security;

-- profile: além do próprio, vê quem está em alguma equipe em comum.
create policy "profile_select_teammates" on public.profile
  for select to authenticated using (public.shares_team_with(id));

-- team: criar só via create_team().
create policy "team_select" on public.team
  for select to authenticated using (public.team_role(id) is not null);
create policy "team_update" on public.team
  for update to authenticated using (public.team_role(id) = 'admin') with check (public.team_role(id) = 'admin');
create policy "team_delete" on public.team
  for delete to authenticated using (public.team_role(id) = 'admin');
revoke update on public.team from authenticated;
grant update (name) on public.team to authenticated;

-- team_member: entrar só por convite (Edge Function, E6) ou create_team().
create policy "team_member_select" on public.team_member
  for select to authenticated using (public.team_role(team_id) is not null);
create policy "team_member_update" on public.team_member
  for update to authenticated using (public.team_role(team_id) = 'admin') with check (public.team_role(team_id) = 'admin');
-- Admin remove qualquer um; qualquer membro pode sair da equipe.
create policy "team_member_delete" on public.team_member
  for delete to authenticated using (public.team_role(team_id) = 'admin' or user_id = auth.uid());
revoke update on public.team_member from authenticated;
grant update (role, job_title) on public.team_member to authenticated;

-- board
create policy "board_select" on public.board
  for select to authenticated using (public.team_role(team_id) is not null);
create policy "board_insert" on public.board
  for insert to authenticated with check (public.team_role(team_id) in ('admin', 'member'));
create policy "board_update" on public.board
  for update to authenticated
  using (public.team_role(team_id) in ('admin', 'member'))
  with check (public.team_role(team_id) in ('admin', 'member'));
create policy "board_delete" on public.board
  for delete to authenticated using (public.team_role(team_id) = 'admin');

-- list, card, label: pelo board.
create policy "list_select" on public.list
  for select to authenticated using (public.board_role(board_id) is not null);
create policy "list_write" on public.list
  for all to authenticated
  using (public.board_role(board_id) in ('admin', 'member'))
  with check (public.board_role(board_id) in ('admin', 'member'));

create policy "card_select" on public.card
  for select to authenticated using (public.board_role(board_id) is not null);
create policy "card_write" on public.card
  for all to authenticated
  using (public.board_role(board_id) in ('admin', 'member'))
  with check (public.board_role(board_id) in ('admin', 'member'));

create policy "label_select" on public.label
  for select to authenticated using (public.board_role(board_id) is not null);
create policy "label_write" on public.label
  for all to authenticated
  using (public.board_role(board_id) in ('admin', 'member'))
  with check (public.board_role(board_id) in ('admin', 'member'));

-- card_label, checklist_item: pelo card. A label precisa ser do mesmo board do card.
create policy "card_label_select" on public.card_label
  for select to authenticated using (public.card_role(card_id) is not null);
create policy "card_label_insert" on public.card_label
  for insert to authenticated with check (
    public.card_role(card_id) in ('admin', 'member')
    and exists (
      select 1 from public.card c join public.label l on l.board_id = c.board_id
      where c.id = card_id and l.id = label_id
    )
  );
create policy "card_label_delete" on public.card_label
  for delete to authenticated using (public.card_role(card_id) in ('admin', 'member'));

create policy "checklist_item_select" on public.checklist_item
  for select to authenticated using (public.card_role(card_id) is not null);
create policy "checklist_item_write" on public.checklist_item
  for all to authenticated
  using (public.card_role(card_id) in ('admin', 'member'))
  with check (public.card_role(card_id) in ('admin', 'member'));

-- Nada disso é acessível sem login.
revoke all on public.team, public.team_member, public.board, public.list, public.card,
  public.label, public.card_label, public.checklist_item from anon;
revoke execute on function public.team_role(bigint), public.board_role(bigint),
  public.card_role(bigint), public.shares_team_with(uuid) from public, anon;
grant execute on function public.team_role(bigint), public.board_role(bigint),
  public.card_role(bigint), public.shares_team_with(uuid) to authenticated;
