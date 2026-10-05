-- Teste da 0015 (peek_invite diz "já é membro" primeiro). Rode inteiro no SQL Editor depois de
-- aplicar a migration. Um bloco DO que termina SEMPRE com erro, para desfazer tudo.
--   Passou: erro "PASSOU: todos os testes da 0015 passaram".
--   Falhou: erro começando com "FALHOU:" (ou qualquer outro erro).

delete from auth.users where email like '%@rls-test.local';

create or replace function pg_temp.uid(p_name text) returns uuid language sql security definer as $$
  select id from auth.users where email = p_name || '@rls-test.local';
$$;

create or replace function pg_temp.login(p_name text) returns void language plpgsql as $$
declare v_uid uuid := pg_temp.uid(p_name);
begin
  if v_uid is null then
    raise exception 'FALHOU: usuário de teste % não foi criado em auth.users', p_name;
  end if;
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if auth.uid() is distinct from v_uid then
    raise exception 'FALHOU: login de teste não funcionou (auth.uid() = %, esperado %)', auth.uid(), v_uid;
  end if;
end;
$$;

create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '{}', true);
end;
$$;

create or replace function pg_temp.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function pg_temp.fails(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;

create or replace function pg_temp.assert_that(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FALHOU: %', p_what;
  end if;
end;
$$;


do $$
declare
  t bigint; v_token uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, email_confirmed_at)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated', now()
  from unnest(array['admin', 'convidado', 'outro']) n;

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  insert into public.team_invite (team_id, label, role) values (t, 'Convidado', 'member') returning token into v_token;
  perform pg_temp.logout();

  perform pg_temp.login('convidado');
  perform pg_temp.assert_that((select status from public.peek_invite(v_token)) = 'valid', 'link novo é válido');
  perform public.accept_invite(v_token);
  perform pg_temp.assert_that((select status from public.peek_invite(v_token)) = 'already_member',
    'quem acabou de usar o link vê "já é membro", não "usado"');
  perform pg_temp.logout();

  perform pg_temp.login('outro');
  perform pg_temp.assert_that((select status from public.peek_invite(v_token)) = 'used', 'para outra pessoa o link está usado');
  perform pg_temp.logout();

  perform pg_temp.login('admin');
  update public.team_invite set revoked_at = now() where token = v_token;
  perform pg_temp.assert_that((select status from public.peek_invite(v_token)) = 'already_member',
    'o admin, que já é membro, vê "já é membro" mesmo com o link cancelado');
  perform pg_temp.logout();

  raise exception 'PASSOU: todos os testes da 0015 passaram (e nada ficou gravado)';
end;
$$;
