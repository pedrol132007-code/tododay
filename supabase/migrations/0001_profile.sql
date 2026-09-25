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
