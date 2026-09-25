-- Teste da 0004 (reordenar, busca, updated_at). Rode inteiro no SQL Editor depois de aplicar a migration.
-- Mesmo formato do teste da 0003: um bloco DO que termina SEMPRE com erro, para desfazer tudo.
--   Passou: erro "PASSOU: todos os testes da 0004 passaram".
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
  t bigint; t2 bigint; b bigint; b2 bigint; l bigint; l2 bigint; c1 bigint; c2 bigint; c_outro bigint;
  v_updated timestamptz;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'leitor', 'estranho']) n;

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  insert into public.board (team_id, name, position) values (t, 'Board', 1) returning id into b;
  insert into public.list (board_id, name, position) values (b, 'Coluna agulha', 1) returning id into l;
  insert into public.list (board_id, name, position) values (b, 'Outra', 2) returning id into l2;
  insert into public.card (list_id, title, description, position) values (l, 'Card um', 'tem agulha aqui', 1) returning id into c1;
  insert into public.card (list_id, title, position) values (l, 'Card dois', 2) returning id into c2;
  perform pg_temp.logout();

  insert into public.team_member (team_id, user_id, role) values (t, pg_temp.uid('leitor'), 'viewer');

  perform pg_temp.login('estranho');
  t2 := public.create_team('Equipe do Estranho');
  insert into public.board (team_id, name, position) values (t2, 'Board do estranho', 1) returning id into b2;
  insert into public.list (board_id, name, position) values (b2, 'Coluna', 1) returning id into l;
  insert into public.card (list_id, title, position) values (l, 'Outra agulha', 1) returning id into c_outro;
  perform pg_temp.logout();

  -- ── admin: reordenar e buscar
  perform pg_temp.login('admin');
  perform public.set_card_positions(jsonb_build_array(
    jsonb_build_object('id', c1, 'position', 2), jsonb_build_object('id', c2, 'position', 1)));
  perform pg_temp.assert_that((select position from public.card where id = c1) = 2
    and (select position from public.card where id = c2) = 1, 'set_card_positions grava as posições');
  perform public.set_list_positions(jsonb_build_array(
    jsonb_build_object('id', l2, 'position', 0.5)));
  perform pg_temp.assert_that((select position from public.list where id = l2) = 0.5, 'set_list_positions grava as posições');
  perform pg_temp.assert_that(pg_temp.row_count(format('select * from public.search_team(%s, %L)', t, 'agulha')) = 2,
    'busca acha o card (pela descrição) e a coluna');
  perform pg_temp.assert_that(pg_temp.row_count(format('select * from public.search_team(%s, %L) where type = %L', t, 'AGULHA', 'card')) = 1,
    'busca ignora maiúsculas');
  perform pg_temp.assert_that(pg_temp.row_count(format('select * from public.search_team(%s, %L)', t2, 'agulha')) = 0,
    'busca em equipe dos outros não traz nada');

  -- updated_at: editar título mexe, mover não
  update public.card set updated_at = '2000-01-01' where id = c1;
  update public.card set position = 5 where id = c1;
  perform pg_temp.assert_that((select updated_at from public.card where id = c1) = '2000-01-01', 'mover não mexe em updated_at');
  update public.card set title = 'Card um editado' where id = c1;
  perform pg_temp.assert_that((select updated_at from public.card where id = c1) > '2000-01-01', 'editar título atualiza updated_at');

  -- arquivado some da busca
  update public.card set archived_at = now() where id = c1;
  perform pg_temp.assert_that(pg_temp.row_count(format('select * from public.search_team(%s, %L) where type = %L', t, 'agulha', 'card')) = 0,
    'card arquivado some da busca');
  perform pg_temp.logout();

  -- ── leitor: busca sim, reordenar não
  perform pg_temp.login('leitor');
  perform pg_temp.assert_that(pg_temp.row_count(format('select * from public.search_team(%s, %L)', t, 'agulha')) = 1,
    'leitor busca');
  perform public.set_card_positions(jsonb_build_array(jsonb_build_object('id', c2, 'position', 99)));
  perform public.set_list_positions(jsonb_build_array(jsonb_build_object('id', l2, 'position', 99)));
  perform pg_temp.logout();
  perform pg_temp.assert_that((select position from public.card where id = c2) = 1, 'leitor não reordena cards');
  perform pg_temp.assert_that((select position from public.list where id = l2) = 0.5, 'leitor não reordena colunas');

  -- ── estranho: não mexe nem acha nada da equipe
  perform pg_temp.login('estranho');
  perform pg_temp.assert_that(pg_temp.row_count(format('select * from public.search_team(%s, %L)', t, 'card')) = 0,
    'estranho não busca na equipe dos outros');
  perform public.set_card_positions(jsonb_build_array(jsonb_build_object('id', c2, 'position', 99)));
  perform pg_temp.logout();
  perform pg_temp.assert_that((select position from public.card where id = c2) = 1, 'estranho não reordena cards dos outros');

  -- ── sem login
  perform set_config('role', 'anon', true);
  perform pg_temp.assert_that(pg_temp.fails(format('select * from public.search_team(%s, %L)', t, 'a')), 'anon não busca');
  perform pg_temp.logout();

  raise exception 'PASSOU: todos os testes da 0004 passaram (e nada ficou gravado)';
end;
$$;
