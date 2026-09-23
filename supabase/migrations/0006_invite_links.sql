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
