-- Teste da 0006 (convite por link). Rode inteiro no SQL Editor depois de aplicar a migration.
-- Mesmo formato dos outros testes: um bloco DO que termina SEMPRE com erro, para desfazer tudo.
--   Passou: erro "PASSOU: todos os testes da 0006 passaram".
--   Falhou: erro começando com "FALHOU:" (ou qualquer outro erro).

-- Sobras de execuções antigas do teste (se houver).
delete from auth.users where email like '%@rls-test.local';

-- ─── Helpers ─────────────────────────────────────────────────────────────────

-- security definer: é chamada também enquanto o teste está logado, e authenticated não lê auth.users.
create or replace function pg_temp.uid(p_name text) returns uuid language sql security definer as $$
  select id from auth.users where email = p_name || '@rls-test.local';
$$;

-- Passa a agir como o usuário (igual a uma requisição do app com o token dele).
-- auth.uid() lê request.jwt.claim.sub ou request.jwt.claims, conforme a versão do projeto: preenche os dois.
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

-- Executa e devolve quantas linhas foram afetadas (RLS em update/delete não dá erro: afeta 0).
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

create or replace function pg_temp.row_count(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') t' into n;
  return n;
end;
$$;


do $$
declare
  t bigint; v_token uuid; v_token2 uuid; v_expirado uuid; v_revogado uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role, email_confirmed_at)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated', now()
  from unnest(array['admin', 'membro', 'convidado', 'segundo']) n;
  -- conta que ainda não confirmou o e-mail
  insert into auth.users (id, email, aud, role) values (gen_random_uuid(), 'naoconfirmado@rls-test.local', 'authenticated', 'authenticated');

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values (t, pg_temp.uid('membro'), 'member');

  -- ── só admin gera links
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.team_invite (team_id, role) values (%s, %L)', t, 'admin')), 'membro não gera link');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.team_invite') = 0, 'membro não vê links');
  perform pg_temp.logout();

  perform pg_temp.login('admin');
  insert into public.team_invite (team_id, label, role, job_title) values (t, 'Convidado', 'viewer', 'Chefe')
  returning token into v_token;
  insert into public.team_invite (team_id, role) values (t, 'member') returning token into v_token2;
  insert into public.team_invite (team_id, role) values (t, 'member') returning token into v_expirado;
  insert into public.team_invite (team_id, role) values (t, 'member') returning token into v_revogado;
  perform pg_temp.assert_that((select created_by from public.team_invite where token = v_token) = auth.uid(),
    'created_by é quem gerou');
  perform pg_temp.assert_that((select expires_at from public.team_invite where token = v_token) > now() + interval '6 days',
    'link vale 7 dias');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.team_invite (team_id, role, token) values (%s, %L, gen_random_uuid())', t, 'admin')),
    'admin não escolhe o token');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.team_invite set expires_at = now() + interval %L where token = %L', '1 year', v_token)),
    'admin não estica a validade');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.team_invite set revoked_at = now() where token = %L', v_revogado)) = 1, 'admin cancela link');
  perform pg_temp.logout();
  update public.team_invite set expires_at = now() - interval '1 minute' where token = v_expirado;

  -- ── conta sem e-mail confirmado não aceita
  perform pg_temp.login('naoconfirmado');
  perform pg_temp.assert_that(pg_temp.fails(format('select public.accept_invite(%L)', v_token2)),
    'e-mail não confirmado não aceita convite');
  perform pg_temp.logout();

  -- ── convidado vê e aceita
  perform pg_temp.login('convidado');
  perform pg_temp.assert_that((select status from public.peek_invite(v_token)) = 'valid', 'peek: link válido');
  perform pg_temp.assert_that((select team_name from public.peek_invite(v_token)) = 'Equipe Teste', 'peek: nome da equipe');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.team') = 0, 'antes de aceitar não vê a equipe');
  perform pg_temp.assert_that(public.accept_invite(v_token) = t, 'aceitar devolve a equipe');
  perform pg_temp.assert_that((select role from public.team_member where team_id = t and user_id = auth.uid()) = 'viewer',
    'entra com o papel do link');
  perform pg_temp.assert_that((select job_title from public.team_member where team_id = t and user_id = auth.uid()) = 'Chefe',
    'entra com o cargo do link');
  perform pg_temp.assert_that((select status from public.peek_invite(v_token)) = 'already_member', 'peek: já é membro');
  perform pg_temp.assert_that(public.accept_invite(v_token) = t, 'aceitar de novo, já sendo membro, não dá erro');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.team_invite') = 0, 'convidado (leitor) não vê links');
  perform pg_temp.logout();

  -- ── link usado, expirado e cancelado não valem
  perform pg_temp.login('segundo');
  perform pg_temp.assert_that((select status from public.peek_invite(v_token)) = 'used', 'peek: link usado');
  perform pg_temp.assert_that(pg_temp.fails(format('select public.accept_invite(%L)', v_token)), 'link usado não vale para outra pessoa');
  perform pg_temp.assert_that((select status from public.peek_invite(v_expirado)) = 'expired', 'peek: link expirado');
  perform pg_temp.assert_that(pg_temp.fails(format('select public.accept_invite(%L)', v_expirado)), 'link expirado não vale');
  perform pg_temp.assert_that((select status from public.peek_invite(v_revogado)) = 'revoked', 'peek: link cancelado');
  perform pg_temp.assert_that(pg_temp.fails(format('select public.accept_invite(%L)', v_revogado)), 'link cancelado não vale');
  perform pg_temp.assert_that(pg_temp.row_count(format('select * from public.peek_invite(%L)', gen_random_uuid())) = 0,
    'peek: token inexistente não traz nada');
  perform pg_temp.assert_that(pg_temp.fails(format('select public.accept_invite(%L)', gen_random_uuid())), 'token inexistente não vale');
  perform pg_temp.assert_that(not exists (select 1 from public.team_member where team_id = t and user_id = auth.uid()),
    'segundo continua fora da equipe');
  -- o outro link ainda vale
  perform pg_temp.assert_that(public.accept_invite(v_token2) = t, 'outro link válido funciona');
  perform pg_temp.logout();

  perform pg_temp.assert_that((select used_by from public.team_invite where token = v_token2) = pg_temp.uid('segundo'),
    'link guarda quem usou');

  -- ── sem login
  perform set_config('role', 'anon', true);
  perform pg_temp.assert_that(pg_temp.fails(format('select * from public.peek_invite(%L)', v_token)), 'anon não espia convite');
  perform pg_temp.assert_that(pg_temp.fails('select * from public.team_invite'), 'anon não lê links');
  perform pg_temp.logout();

  raise exception 'PASSOU: todos os testes da 0006 passaram (e nada ficou gravado)';
end;
$$;
