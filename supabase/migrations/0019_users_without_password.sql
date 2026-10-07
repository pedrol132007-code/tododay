-- Quem ainda não definiu senha (convite aberto e fechado antes de criar a senha, ou nunca aberto).
--
-- A Edge Function "members" usa isto no lugar de "nunca entrou" (last_sign_in_at): abrir o link do
-- convite já conta como entrada, então quem fechava a tela antes de criar a senha perdia o botão
-- "Gerar link de acesso" e ficava sem como entrar. Quem tem senha continua sem o botão: um admin
-- nunca consegue um link para a conta de quem já usa o app.
--
-- Só a service_role executa (o app nunca chama; a função lê auth.users).

create function public.users_without_password(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u
  where u.id = any(p_ids) and coalesce(u.encrypted_password, '') = '';
$$;

revoke execute on function public.users_without_password(uuid[]) from public, anon, authenticated;
grant execute on function public.users_without_password(uuid[]) to service_role;
