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
