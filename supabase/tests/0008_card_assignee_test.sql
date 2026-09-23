-- Teste da 0008 (responsável nos cards). Rode inteiro no SQL Editor depois de aplicar a migration.
-- Mesmo formato dos outros testes: um bloco DO que termina SEMPRE com erro, para desfazer tudo.
--   Passou: erro "PASSOU: todos os testes da 0008 passaram".
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
  t bigint; t2 bigint; b bigint; b2 bigint; l bigint; l2 bigint; c bigint; c2 bigint; c_outro bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'membro', 'estranho']) n;

  perform pg_temp.login('estranho');
  t2 := public.create_team('Equipe do Estranho');
  insert into public.board (team_id, name, position) values (t2, 'Board do estranho', 1) returning id into b2;
  insert into public.list (board_id, name, position) values (b2, 'Coluna', 1) returning id into l2;
  insert into public.card (list_id, title, position, assignee_id) values (l2, 'Card do estranho', 1, auth.uid()) returning id into c_outro;
  perform pg_temp.logout();

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  insert into public.board (team_id, name, position) values (t, 'Board', 1) returning id into b;
  insert into public.list (board_id, name, position) values (b, 'Coluna', 1) returning id into l;
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values (t, pg_temp.uid('membro'), 'member');
  -- membro também está na equipe do estranho, para ver que sair de uma não mexe na outra
  insert into public.team_member (team_id, user_id, role) values (t2, pg_temp.uid('membro'), 'member');

  perform pg_temp.login('admin');
  insert into public.card (list_id, title, position, assignee_id) values (l, 'Card', 1, pg_temp.uid('membro')) returning id into c;
  perform pg_temp.assert_that((select assignee_id from public.card where id = c) = pg_temp.uid('membro'),
    'criar card já com responsável (trigger roda depois de preencher board_id)');
  insert into public.card (list_id, title, position) values (l, 'Card 2', 2) returning id into c2;
  update public.card set assignee_id = auth.uid() where id = c2;
  perform pg_temp.assert_that((select assignee_id from public.card where id = c2) = auth.uid(), 'atribuir a si mesmo');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.card set assignee_id = %L where id = %s', pg_temp.uid('estranho'), c)),
    'quem não é da equipe não pode ser responsável');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.card (list_id, title, position, assignee_id) values (%s, %L, 3, %L)', l, 'x', pg_temp.uid('estranho'))),
    'nem ao criar o card');
  update public.card set assignee_id = null where id = c2;
  perform pg_temp.assert_that((select assignee_id from public.card where id = c2) is null, 'desatribuir');
  update public.card set assignee_id = pg_temp.uid('membro') where id = c2;

  -- ── remover da equipe desatribui só os cards dessa equipe
  perform pg_temp.assert_that(pg_temp.affected(format(
    'delete from public.team_member where team_id = %s and user_id = %L', t, pg_temp.uid('membro'))) = 1, 'admin remove membro');
  perform pg_temp.logout();
  perform pg_temp.assert_that((select assignee_id from public.card where id = c) is null
    and (select assignee_id from public.card where id = c2) is null, 'removido deixa de ser responsável');
  update public.card set assignee_id = pg_temp.uid('membro') where id = c_outro;
  perform pg_temp.assert_that((select assignee_id from public.card where id = c_outro) = pg_temp.uid('membro'),
    'na outra equipe ele continua podendo ser responsável');

  -- ── sair por conta própria também desatribui
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'delete from public.team_member where team_id = %s and user_id = auth.uid()', t2)) = 1, 'membro sai da equipe');
  perform pg_temp.logout();
  perform pg_temp.assert_that((select assignee_id from public.card where id = c_outro) is null, 'quem sai deixa de ser responsável');

  -- ── apagar a equipe com cards atribuídos não trava
  update public.card set assignee_id = pg_temp.uid('admin') where id = c;
  perform pg_temp.login('admin');
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.team where id = %s', t)) = 1,
    'apagar equipe com cards atribuídos funciona');
  perform pg_temp.logout();

  -- ── conta apagada: card fica sem responsável
  update public.card set assignee_id = pg_temp.uid('estranho') where id = c_outro;
  delete from auth.users where id = pg_temp.uid('estranho');
  perform pg_temp.assert_that((select assignee_id from public.card where id = c_outro) is null,
    'conta apagada deixa o card sem responsável');

  raise exception 'PASSOU: todos os testes da 0008 passaram (e nada ficou gravado)';
end;
$$;
