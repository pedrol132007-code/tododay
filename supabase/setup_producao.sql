-- GERADO por npm run gen:setup: junção de supabase/migrations/0001..0016, para aplicar tudo de uma vez
-- num projeto novo. Não edite aqui; a fonte são as migrations. Rode inteiro no SQL Editor.

-- ════════ 0001_profile.sql ════════
-- Perfil público de cada usuário, criado automaticamente no cadastro.
-- auth.users é do Supabase; o app só lê/escreve public.profile.

create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profile enable row level security;

-- Por enquanto cada um só enxerga o próprio perfil; a E3 libera ver colegas de equipe.
create policy "profile_select_own" on public.profile
  for select using (id = auth.uid());

create policy "profile_update_own" on public.profile
  for update using (id = auth.uid()) with check (id = auth.uid());

-- O e-mail vem de auth.users e não é editável pelo cliente.
revoke update on public.profile from authenticated;
grant update (display_name) on public.profile to authenticated;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém profile.email em dia se o usuário trocar de e-mail.
create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profile set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ════════ 0002_profile_backfill.sql ════════
-- Contas criadas antes da 0001 existir não passaram pelo trigger e ficaram sem perfil.
insert into public.profile (id, email, display_name)
select u.id, u.email,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), split_part(u.email, '@', 1))
from auth.users u
where u.email is not null
on conflict (id) do nothing;

-- ════════ 0003_teams_and_boards.sql ════════
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

-- ════════ 0004_moves_and_search.sql ════════
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

-- ════════ 0005_team_invites.sql ════════
-- Convites para equipe (E6).
--
-- Fluxo:
--   1. Admin chama a Edge Function invite-member, que chama invite_member() com o token do admin.
--   2. Se já existe conta com e-mail confirmado, a pessoa entra na hora ('added').
--   3. Senão o convite fica pendente ('pending') e a Edge Function manda o e-mail.
--   4. Quando o e-mail é confirmado (link de convite ou cadastro normal), o trigger em
--      auth.users converte os convites pendentes daquele e-mail em team_member.
-- Converter só na confirmação impede alguém de herdar acesso cadastrando o e-mail de outra pessoa.

create table public.team_invite (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.team (id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  role public.member_role not null,
  job_title text not null default '',
  invited_by uuid references public.profile (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create unique index team_invite_one_pending on public.team_invite (team_id, email)
  where accepted_at is null and revoked_at is null;
create index idx_team_invite_email on public.team_invite (email)
  where accepted_at is null and revoked_at is null;

alter table public.team_invite enable row level security;

-- Só admin vê e revoga convites; criar é sempre por invite_member().
create policy "team_invite_select" on public.team_invite
  for select to authenticated using (public.team_role(team_id) = 'admin');
create policy "team_invite_update" on public.team_invite
  for update to authenticated
  using (public.team_role(team_id) = 'admin')
  with check (public.team_role(team_id) = 'admin');
revoke all on public.team_invite from anon;
revoke insert, update, delete on public.team_invite from authenticated;
grant update (revoked_at) on public.team_invite to authenticated;

-- ─── invite_member ────────────────────────────────────────────────────────────

create function public.invite_member(p_team_id bigint, p_email text, p_role public.member_role, p_job_title text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_user_id uuid;
begin
  if public.team_role(p_team_id) is distinct from 'admin' then
    raise exception 'Só admins podem convidar' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido' using errcode = '22023';
  end if;

  select u.id into v_user_id from auth.users u
  where lower(u.email) = v_email and u.email_confirmed_at is not null;

  if v_user_id is not null then
    if exists (select 1 from public.team_member m where m.team_id = p_team_id and m.user_id = v_user_id) then
      raise exception 'Essa pessoa já está na equipe' using errcode = '23505';
    end if;
    -- Pode ter um pendente de antes da confirmação: fecha ele.
    update public.team_invite set accepted_at = now()
    where team_id = p_team_id and email = v_email and accepted_at is null and revoked_at is null;
    insert into public.team_invite (team_id, email, role, job_title, invited_by, accepted_at)
    values (p_team_id, v_email, p_role, coalesce(trim(p_job_title), ''), auth.uid(), now());
    insert into public.team_member (team_id, user_id, role, job_title)
    values (p_team_id, v_user_id, p_role, coalesce(trim(p_job_title), ''));
    return 'added';
  end if;

  -- Reconvidar o mesmo e-mail atualiza o convite pendente.
  insert into public.team_invite (team_id, email, role, job_title, invited_by)
  values (p_team_id, v_email, p_role, coalesce(trim(p_job_title), ''), auth.uid())
  on conflict (team_id, email) where accepted_at is null and revoked_at is null
  do update set role = excluded.role, job_title = excluded.job_title,
                invited_by = excluded.invited_by, created_at = now();
  return 'pending';
end;
$$;

revoke execute on function public.invite_member(bigint, text, public.member_role, text) from public, anon;
grant execute on function public.invite_member(bigint, text, public.member_role, text) to authenticated;

-- ─── Converter convites na confirmação do e-mail ──────────────────────────────

create function public.accept_pending_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null or new.email is null then
    return new;
  end if;
  insert into public.team_member (team_id, user_id, role, job_title)
  select i.team_id, new.id, i.role, i.job_title
  from public.team_invite i
  where i.email = lower(new.email) and i.accepted_at is null and i.revoked_at is null
  on conflict (team_id, user_id) do nothing;
  update public.team_invite set accepted_at = now()
  where email = lower(new.email) and accepted_at is null and revoked_at is null;
  return new;
end;
$$;

-- Triggers do mesmo evento rodam em ordem alfabética: "verified" vem depois de
-- on_auth_user_created, então o profile já existe quando este roda.
create trigger on_auth_user_verified
  after insert or update of email_confirmed_at on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.accept_pending_invites();

-- ════════ 0006_invite_links.sql ════════
-- Troca o convite por e-mail (0005) por convite por link.
--
-- O admin gera um link para uma pessoa (papel, cargo e um rótulo tipo "Carla - RH").
-- O link vale para UMA pessoa, por 7 dias, e pode ser cancelado. Quem abre, entra ou
-- cria a conta (confirmando o e-mail) e aceita; aí o link deixa de valer.
-- Quem tiver o link consegue entrar: por isso ele é de uso único, expira, e o admin
-- escolhe o papel antes de gerar.

drop trigger on_auth_user_verified on auth.users;
drop function public.accept_pending_invites();
drop function public.invite_member(bigint, text, public.member_role, text);
drop table public.team_invite;

create table public.team_invite (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.team (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  label text not null default '',
  role public.member_role not null,
  job_title text not null default '',
  created_by uuid default auth.uid() references public.profile (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references public.profile (id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz
);

create index idx_team_invite_team on public.team_invite (team_id);

alter table public.team_invite enable row level security;

-- Só admin gera, vê e cancela links da equipe. Aceitar é por accept_invite().
create policy "team_invite_select" on public.team_invite
  for select to authenticated using (public.team_role(team_id) = 'admin');
create policy "team_invite_insert" on public.team_invite
  for insert to authenticated with check (public.team_role(team_id) = 'admin');
create policy "team_invite_update" on public.team_invite
  for update to authenticated
  using (public.team_role(team_id) = 'admin')
  with check (public.team_role(team_id) = 'admin');
revoke all on public.team_invite from anon;
revoke insert, update, delete on public.team_invite from authenticated;
grant insert (team_id, label, role, job_title) on public.team_invite to authenticated;
grant update (revoked_at) on public.team_invite to authenticated;

-- ─── Ler um convite pelo token (tela "Você foi convidado") ────────────────────

create function public.peek_invite(p_token uuid)
returns table (team_name text, role public.member_role, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.name, i.role,
    case
      when i.revoked_at is not null then 'revoked'
      when i.used_at is not null then 'used'
      when i.expires_at < now() then 'expired'
      when exists (select 1 from public.team_member m where m.team_id = i.team_id and m.user_id = auth.uid())
        then 'already_member'
      else 'valid'
    end
  from public.team_invite i
  join public.team t on t.id = i.team_id
  where i.token = p_token and auth.uid() is not null;
$$;

-- ─── Aceitar ──────────────────────────────────────────────────────────────────

create function public.accept_invite(p_token uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.team_invite;
begin
  if auth.uid() is null then
    raise exception 'Precisa estar logado';
  end if;
  if not exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null) then
    raise exception 'Confirme seu e-mail antes de aceitar o convite';
  end if;

  -- for update: duas pessoas abrindo o mesmo link ao mesmo tempo não entram as duas.
  select * into v_invite from public.team_invite where token = p_token for update;
  if not found then
    raise exception 'Convite não encontrado';
  end if;
  if exists (select 1 from public.team_member m where m.team_id = v_invite.team_id and m.user_id = auth.uid()) then
    -- Já é membro: não gasta o link.
    return v_invite.team_id;
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'Esse convite foi cancelado. Peça um novo ao admin da equipe.';
  end if;
  if v_invite.used_at is not null then
    raise exception 'Esse convite já foi usado. Peça um novo ao admin da equipe.';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'Esse convite expirou. Peça um novo ao admin da equipe.';
  end if;

  insert into public.team_member (team_id, user_id, role, job_title)
  values (v_invite.team_id, auth.uid(), v_invite.role, v_invite.job_title);
  update public.team_invite set used_by = auth.uid(), used_at = now() where id = v_invite.id;
  return v_invite.team_id;
end;
$$;

revoke execute on function public.peek_invite(uuid), public.accept_invite(uuid) from public, anon;
grant execute on function public.peek_invite(uuid), public.accept_invite(uuid) to authenticated;

-- ════════ 0007_realtime.sql ════════
-- E7: o app assina mudanças destas tabelas (Supabase Realtime, "postgres_changes") para
-- atualizar a tela quando outra pessoa mexe no board. A RLS continua valendo: cada um só
-- recebe eventos de linhas que pode ler. Exceção do próprio Realtime: eventos de DELETE não
-- passam por filtro nem RLS, mas só carregam a chave primária (o id), nunca o conteúdo.

alter publication supabase_realtime add table
  public.board, public.list, public.card, public.label, public.card_label, public.checklist_item;

-- ════════ 0008_card_assignee.sql ════════
-- E8: responsável pelo card. Precisa ser membro da equipe dona do board; quem sai
-- (ou é removido) da equipe deixa de ser responsável pelos cards dela.

alter table public.card
  add column assignee_id uuid references public.profile (id) on delete set null;

create index idx_card_assignee on public.card (assignee_id);

-- Nome começa com "v" de propósito: triggers do mesmo evento rodam em ordem alfabética,
-- e este precisa rodar depois de card_set_board_id (que preenche board_id no insert).
create function public.validate_card_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null and not exists (
    select 1 from public.board b
    join public.team_member m on m.team_id = b.team_id
    where b.id = new.board_id and m.user_id = new.assignee_id
  ) then
    raise exception 'O responsável precisa ser membro da equipe';
  end if;
  return new;
end;
$$;

create trigger card_validate_assignee
  before insert or update of assignee_id, list_id on public.card
  for each row execute function public.validate_card_assignee();

create function public.unassign_removed_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Apagar a equipe apaga os cards em cascata, e apagar a conta já desatribui pela FK
  -- (on delete set null): nos dois casos não há o que fazer, e mexer nos cards no meio da
  -- cascata daria conflito.
  if not exists (select 1 from public.team t where t.id = old.team_id)
     or not exists (select 1 from public.profile p where p.id = old.user_id) then
    return old;
  end if;
  update public.card c set assignee_id = null
  from public.board b
  where b.id = c.board_id and b.team_id = old.team_id and c.assignee_id = old.user_id;
  return old;
end;
$$;

create trigger team_member_unassign_cards
  after delete on public.team_member
  for each row execute function public.unassign_removed_member();

-- ════════ 0009_activity.sql ════════
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

-- ════════ 0010_list_status_card_priority.sql ════════
-- Base das métricas por status e dos cards com contexto.
--   list.status: o tipo por trás da coluna (o nome continua livre). Colunas novas: 'todo'.
--   card.priority: prioridade opcional (null = sem prioridade).
--   card.list_entered_at: quando o card entrou na coluna atual ("parada há X dias").

alter table public.list
  add column status text not null default 'todo'
  check (status in ('todo', 'doing', 'done'));

-- Palpite inicial pelo nome das colunas que já existem; dá para trocar depois no menu da coluna.
update public.list set status = 'done'
where name ~* '(conclu|finaliz|feito|entregue|done|pronto)';
update public.list set status = 'doing'
where status = 'todo' and name ~* '(andamento|fazendo|progresso|execu|doing|revis|valida|teste)';

alter table public.card
  add column priority text check (priority in ('low', 'medium', 'high', 'urgent')),
  add column list_entered_at timestamptz not null default now();

-- Cards que já existem: último "card movido" do histórico de atividade; sem ele, a criação.
update public.card c set list_entered_at = coalesce(
  (select max(a.created_at) from public.activity a where a.card_id = c.id and a.action = 'card.moved'),
  c.created_at);

-- Relógio do servidor: muda só quando o card troca de coluna, e ninguém ajusta à mão.
create function public.touch_card_list_entered_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.list_entered_at := now();
  elsif new.list_id is distinct from old.list_id then
    new.list_entered_at := now();
  else
    new.list_entered_at := old.list_entered_at;
  end if;
  return new;
end;
$$;

create trigger card_touch_list_entered_at
  before insert or update on public.card
  for each row execute function public.touch_card_list_entered_at();

-- ════════ 0011_attachments.sql ════════
-- Anexos dos cards. O arquivo fica no Storage (bucket privado "attachments"); o banco guarda só
-- os metadados. Caminho no bucket: "<card_id>/<uuid>" (o nome original é só metadado).
--
-- Fluxo de envio (a Edge Function "attachments" é a única que grava aqui):
--   1. O app envia o arquivo direto ao Storage. A policy só deixa quem edita o card, e o bucket
--      recusa acima de 20 MB e tipos fora da lista (pelo Content-Type declarado).
--   2. A Edge Function confere o conteúdo real (assinatura dos bytes), grava a linha abaixo e,
--      se o arquivo não passar, apaga do Storage. Enquanto não há linha, ninguém lê o arquivo.
-- Exclusão: o banco não apaga arquivos do Storage. Apagar um anexo (sozinho ou em cascata do
-- card, da coluna, do board ou da equipe) põe o caminho na attachment_trash, e a Edge Function
-- esvazia a lixeira (o app chama depois de excluir). Arquivar o card não mexe nos anexos.

create table public.card_attachment (
  id bigint generated always as identity primary key,
  card_id bigint not null references public.card (id) on delete cascade,
  -- Desnormalizado (como em card) para contar anexos do board e para o filtro do Realtime.
  board_id bigint not null references public.board (id) on delete cascade,
  name text not null check (length(name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  storage_path text not null unique,
  uploaded_by uuid references public.profile (id) on delete set null,
  -- Nome da época, como no histórico: quem sai da equipe some de profile para os outros.
  uploaded_by_name text not null,
  created_at timestamptz not null default now(),
  -- Imagem usada como capa do card no board (no máximo uma por card).
  is_cover boolean not null default false,
  check (not is_cover or mime_type like 'image/%')
);

create index idx_card_attachment_card on public.card_attachment (card_id, created_at);
create index idx_card_attachment_board on public.card_attachment (board_id);
create unique index idx_card_attachment_one_cover on public.card_attachment (card_id) where is_cover;

create function public.set_attachment_board_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.board_id := (select c.board_id from public.card c where c.id = new.card_id);
  return new;
end;
$$;

create trigger card_attachment_set_board_id
  before insert on public.card_attachment
  for each row execute function public.set_attachment_board_id();

-- Se o card for para uma coluna de outro board, os anexos acompanham.
create function public.sync_attachment_board_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.board_id is distinct from old.board_id then
    update public.card_attachment set board_id = new.board_id where card_id = new.id;
  end if;
  return new;
end;
$$;

create trigger card_sync_attachment_board_id
  after update of board_id on public.card
  for each row execute function public.sync_attachment_board_id();

-- ─── Lixeira do Storage ──────────────────────────────────────────────────────

create table public.attachment_trash (
  storage_path text primary key,
  deleted_at timestamptz not null default now()
);

create function public.trash_attachment_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.attachment_trash (storage_path) values (old.storage_path) on conflict do nothing;
  return old;
end;
$$;

create trigger card_attachment_trash_file
  after delete on public.card_attachment
  for each row execute function public.trash_attachment_file();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.card_attachment enable row level security;
alter table public.attachment_trash enable row level security;

create policy "card_attachment_select" on public.card_attachment
  for select to authenticated using (public.card_role(card_id) is not null);
create policy "card_attachment_delete" on public.card_attachment
  for delete to authenticated using (public.card_role(card_id) in ('admin', 'member'));
-- Inserir: só a Edge Function (service_role), depois de conferir o conteúdo. Alterar: só a capa,
-- pela função abaixo.
revoke all on public.card_attachment from anon;
revoke insert, update on public.card_attachment from authenticated;
-- A lixeira é só da Edge Function.
revoke all on public.attachment_trash from anon, authenticated;

-- Capa: liga numa imagem do card e desliga nas outras; null tira a capa.
create function public.set_card_cover(p_card_id bigint, p_attachment_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.card_role(p_card_id)::text, '') not in ('admin', 'member') then
    raise exception 'Sem permissão para editar este card';
  end if;
  if p_attachment_id is not null and not exists (
    select 1 from public.card_attachment a
    where a.id = p_attachment_id and a.card_id = p_card_id and a.mime_type like 'image/%'
  ) then
    raise exception 'A capa precisa ser uma imagem anexada a este card';
  end if;
  update public.card_attachment set is_cover = false where card_id = p_card_id and is_cover;
  if p_attachment_id is not null then
    update public.card_attachment set is_cover = true where id = p_attachment_id;
  end if;
end;
$$;

revoke execute on function public.set_card_cover(bigint, bigint) from public, anon;
grant execute on function public.set_card_cover(bigint, bigint) to authenticated;

-- ─── Storage ──────────────────────────────────────────────────────────────────

-- 20 MB = MAX_ATTACHMENT_MB (src/lib/attachmentRules.ts). Tipos = ALLOWED_MIME_TYPES.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 20971520,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/zip'
  ]
);

-- card_id de um caminho "<card_id>/<uuid>"; null se o caminho não tiver esse formato.
create function public.attachment_path_card_id(p_path text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_path ~ '^[0-9]{1,18}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_path, '/', 1)::bigint
  end;
$$;

create function public.can_upload_attachment(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.card_role(public.attachment_path_card_id(p_path)) in ('admin', 'member'), false);
$$;

-- Só lê (e gera URL assinada) quem enxerga o card, e só depois de a Edge Function aprovar.
create function public.can_read_attachment(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.card_attachment a
    where a.storage_path = p_path and public.card_role(a.card_id) is not null
  );
$$;

revoke execute on function public.attachment_path_card_id(text), public.can_upload_attachment(text),
  public.can_read_attachment(text) from public, anon;
grant execute on function public.attachment_path_card_id(text), public.can_upload_attachment(text),
  public.can_read_attachment(text) to authenticated;

-- Sem policy de update nem de delete: ninguém sobrescreve nem apaga pelo app; quem apaga é a
-- Edge Function, pela lixeira.
create policy "attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_upload_attachment(name));
create policy "attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and public.can_read_attachment(name));

-- Arquivos enviados que a Edge Function nunca aprovou (o envio caiu no meio): ela apaga os mais
-- antigos que p_older_than ao esvaziar a lixeira.
create function public.attachment_orphans(p_older_than interval)
returns table (storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'attachments'
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.card_attachment a where a.storage_path = o.name)
    and not exists (select 1 from public.attachment_trash t where t.storage_path = o.name);
$$;

revoke execute on function public.attachment_orphans(interval) from public, anon, authenticated;
grant execute on function public.attachment_orphans(interval) to service_role;

-- ─── Realtime ─────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.card_attachment;

-- ════════ 0012_card_status_history.sql ════════
-- Histórico de status dos cards: a base das métricas reais do dashboard (entregas, lead time,
-- backlog, paradas). Cada linha diz "a partir deste momento o card estava neste status".
--
-- Só o banco escreve aqui, por triggers, nunca o app:
--   - card criado: o status da coluna em que nasceu;
--   - card trocou de coluna ou foi desarquivado: o status da coluna, se mudou;
--   - coluna trocou de tipo: o novo status para cada card (não arquivado) que está nela.
-- Renomear coluna não muda nada (o activity guarda nomes; aqui vale o tipo). Arquivar também
-- não: quem lê decide o que fazer com card.archived_at. Apagar o card apaga o histórico dele.

create table public.card_status_history (
  id bigint generated always as identity primary key,
  card_id bigint not null references public.card (id) on delete cascade,
  board_id bigint not null references public.board (id) on delete cascade,
  status text not null check (status in ('todo', 'doing', 'done')),
  changed_at timestamptz not null default now()
);

create index card_status_history_board_changed on public.card_status_history (board_id, changed_at);
create index card_status_history_card on public.card_status_history (card_id, changed_at);

alter table public.card_status_history enable row level security;

-- Leitura para quem vê o board; nenhuma política de escrita (os triggers são security definer).
create policy "card_status_history_select" on public.card_status_history
  for select to authenticated using (public.board_role(board_id) is not null);

revoke insert, update, delete, truncate on public.card_status_history from anon, authenticated;

-- Cards que já existem: só o que se sabe com certeza, o status atual desde que entraram na coluna.
-- O caminho anterior não é inventado.
insert into public.card_status_history (card_id, board_id, status, changed_at)
select c.id, c.board_id, l.status, c.list_entered_at
from public.card c
join public.list l on l.id = c.list_id;

-- Compara com o último status gravado (e não com a coluna anterior): assim um card desarquivado
-- numa coluna que mudou de tipo enquanto ele estava arquivado também fica certo.
create function public.card_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select l.status into v_status from public.list l where l.id = new.list_id;
  if v_status is distinct from (
    select h.status from public.card_status_history h where h.card_id = new.id order by h.id desc limit 1
  ) then
    insert into public.card_status_history (card_id, board_id, status) values (new.id, new.board_id, v_status);
  end if;
  return null;
end;
$$;

create trigger card_log_status
  after insert or update of list_id, archived_at on public.card
  for each row execute function public.card_log_status();

create function public.list_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.card_status_history (card_id, board_id, status)
    select c.id, c.board_id, new.status
    from public.card c
    where c.list_id = new.id and c.archived_at is null;
  end if;
  return null;
end;
$$;

create trigger list_log_status
  after update of status on public.list
  for each row execute function public.list_log_status();

revoke execute on function public.card_log_status(), public.list_log_status() from public, anon, authenticated;

-- ════════ 0013_admin_lists_and_deactivation.sql ════════
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

-- ════════ 0014_revoke_anon.sql ════════
-- Quem não está logado (papel anon) não tem nada a fazer no schema public: o app inteiro exige
-- login. A RLS já barrava tudo (as policies são "to authenticated"), mas algumas tabelas ainda tinham
-- o grant padrão para anon (profile, card_status_history). Aqui o grant sai de tudo, de uma vez, e
-- também das tabelas e funções que vierem depois. Conferido por supabase/tests/auditoria_seguranca.sql.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- ════════ 0015_peek_invite_member_first.sql ════════
-- peek_invite passa a dizer "já é membro" antes de "usado/expirado/cancelado", na mesma ordem do
-- accept_invite (que, para quem já é membro, devolve a equipe sem olhar o resto). Antes, quem abria
-- de novo o link que acabou de usar via "esse convite já foi usado" em vez de "você já está na equipe".

create or replace function public.peek_invite(p_token uuid)
returns table (team_name text, role public.member_role, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.name, i.role,
    case
      when exists (select 1 from public.team_member m where m.team_id = i.team_id and m.user_id = auth.uid())
        then 'already_member'
      when i.revoked_at is not null then 'revoked'
      when i.used_at is not null then 'used'
      when i.expires_at < now() then 'expired'
      else 'valid'
    end
  from public.team_invite i
  join public.team t on t.id = i.team_id
  where i.token = p_token and auth.uid() is not null;
$$;

-- ════════ 0016_leader_and_avatar.sql ════════
-- Coroa de líder e foto de perfil (docs/superpowers/specs/2026-10-07-lider-e-notificacoes-design.md).
--
-- 1. team_member.is_leader: um selo, não um papel. Permissão continua sendo só o role. Só o admin
--    muda (policy team_member_update, 0003). Leitor não é líder.
-- 2. profile.avatar_path: foto no bucket público "avatars", em "<user_id>/<uuid>.<ext>". Cada um
--    grava e apaga só na própria pasta. Público porque é uma foto de perfil vista pela equipe toda
--    e o nome do arquivo é um uuid novo a cada troca (ninguém adivinha).

-- ─── Líder ────────────────────────────────────────────────────────────────────

alter table public.team_member add column is_leader boolean not null default false;
alter table public.team_member add constraint team_member_viewer_not_leader
  check (not (is_leader and role = 'viewer'));

grant update (is_leader) on public.team_member to authenticated;

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
    if new.is_leader is distinct from old.is_leader then
      perform public.log_activity(new.team_id, null, null,
        case when new.is_leader then 'member.leader_on' else 'member.leader_off' end,
        jsonb_build_object('name', v_name));
    end if;
  end if;
  return v_member;
end;
$$;

drop trigger team_member_log_activity on public.team_member;
create trigger team_member_log_activity
  after insert or delete or update of role, job_title, deactivated_at, is_leader on public.team_member
  for each row execute function public.team_member_activity();

-- ─── Foto de perfil ───────────────────────────────────────────────────────────

alter table public.profile add column avatar_path text;
alter table public.profile add constraint profile_avatar_own_folder
  check (avatar_path is null or avatar_path like id::text || '/%');

grant update (display_name, avatar_path) on public.profile to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- "<user_id>/..." é da pessoa logada.
create function public.avatar_path_is_mine(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((storage.foldername(p_name))[1] = auth.uid()::text, false);
$$;

revoke execute on function public.avatar_path_is_mine(text) from public, anon;
grant execute on function public.avatar_path_is_mine(text) to authenticated;

-- Leitura é pública (bucket público); o select abaixo é o que a API de Storage exige para apagar.
create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.avatar_path_is_mine(name));
create policy "avatars_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.avatar_path_is_mine(name));
create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.avatar_path_is_mine(name));
