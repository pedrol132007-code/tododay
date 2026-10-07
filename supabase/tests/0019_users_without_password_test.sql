-- Teste da 0019 (quem ainda não definiu senha). Um bloco DO que termina SEMPRE com erro.
--   Passou: erro "PASSOU: todos os testes da 0019 passaram".
--   Falhou: erro começando com "FALHOU:" (ou qualquer outro erro).

delete from auth.users where email like '%@rls-test.local';

create or replace function pg_temp.assert_that(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FALHOU: %', p_what;
  end if;
end;
$$;


do $$
declare
  v_com uuid := gen_random_uuid();
  v_vazia uuid := gen_random_uuid();
  v_nula uuid := gen_random_uuid();
  v_ids uuid[];
begin
  insert into auth.users (id, email, raw_user_meta_data, encrypted_password, last_sign_in_at, aud, role) values
    (v_com, 'com-senha@rls-test.local', '{}', '$2a$10$hashqualquerdesenha', now(), 'authenticated', 'authenticated'),
    -- Abriu o convite (já "entrou") e fechou antes de criar a senha.
    (v_vazia, 'sem-senha@rls-test.local', '{}', '', now(), 'authenticated', 'authenticated'),
    (v_nula, 'nunca-abriu@rls-test.local', '{}', null, null, 'authenticated', 'authenticated');

  select array_agg(x) into v_ids from public.users_without_password(array[v_com, v_vazia, v_nula]) x;
  perform pg_temp.assert_that(v_vazia = any(v_ids), 'senha vazia conta como sem senha, mesmo já tendo entrado');
  perform pg_temp.assert_that(v_nula = any(v_ids), 'senha nula conta como sem senha');
  perform pg_temp.assert_that(not (v_com = any(v_ids)), 'quem tem senha não entra na lista');
  perform pg_temp.assert_that(cardinality(v_ids) = 2, 'só os ids pedidos');

  perform pg_temp.assert_that(has_function_privilege('service_role', 'public.users_without_password(uuid[])', 'execute'),
    'service_role executa');
  perform pg_temp.assert_that(not has_function_privilege('authenticated', 'public.users_without_password(uuid[])', 'execute'),
    'usuário logado não executa');
  perform pg_temp.assert_that(not has_function_privilege('anon', 'public.users_without_password(uuid[])', 'execute'),
    'anon não executa');

  -- has_password: cada um só sabe da própria conta.
  perform set_config('request.jwt.claims', json_build_object('sub', v_vazia, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform pg_temp.assert_that(public.has_password() = false, 'sem senha: has_password é false');
  perform set_config('request.jwt.claims', json_build_object('sub', v_com, 'role', 'authenticated')::text, true);
  perform pg_temp.assert_that(public.has_password() = true, 'com senha: has_password é true');
  perform set_config('role', 'none', true);
  perform pg_temp.assert_that(not has_function_privilege('anon', 'public.has_password()', 'execute'),
    'anon não executa has_password');

  raise exception 'PASSOU: todos os testes da 0019 passaram';
end;
$$;
