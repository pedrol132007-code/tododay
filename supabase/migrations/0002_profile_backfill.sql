-- Contas criadas antes da 0001 existir não passaram pelo trigger e ficaram sem perfil.
insert into public.profile (id, email, display_name)
select u.id, u.email,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), split_part(u.email, '@', 1))
from auth.users u
where u.email is not null
on conflict (id) do nothing;
