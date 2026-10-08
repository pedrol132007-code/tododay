-- Teste da 0021 (só o líder vê todos os boards; admin entra pelos boards). Um bloco DO que termina SEMPRE com erro.
--   Passou: erro "PASSOU: todos os testes da 0021 passaram".
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
  t bigint; b1 bigint; b2 bigint; l1 bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'admin2', 'lider', 'membro']) n;

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  -- Admin cria board com insert ... returning (o board ainda não tem ninguém na hora de ler a linha).
  insert into public.board (team_id, name, position) values (t, 'Do admin', 1) returning id into b1;
  insert into public.list (board_id, name, position) values (b1, 'A fazer', 1) returning id into l1;
  perform pg_temp.assert_that(exists (select 1 from public.board_member where board_id = b1 and user_id = pg_temp.uid('admin')),
    'quem cria o board entra nele');
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role, is_leader) values
    (t, pg_temp.uid('admin2'), 'admin', false), (t, pg_temp.uid('lider'), 'member', true), (t, pg_temp.uid('membro'), 'member', false);
  insert into public.board_member (board_id, user_id) values (b1, pg_temp.uid('membro'));

  -- ── Admin fora do board não vê ──
  perform pg_temp.login('admin2');
  perform pg_temp.assert_that(not exists (select 1 from public.board where id = b1), 'admin fora do board não vê o board');
  perform pg_temp.assert_that(not exists (select 1 from public.list where board_id = b1), 'nem as colunas');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.board set name = %L where id = %s', 'x', b1)) = 0,
    'nem renomeia');
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.board where id = %s', b1)) = 0, 'nem exclui');
  perform pg_temp.logout();

  -- ── Líder vê tudo ──
  perform pg_temp.login('lider');
  perform pg_temp.assert_that(exists (select 1 from public.list where board_id = b1), 'líder vê todos os boards');
  -- O líder põe o admin2 no board.
  insert into public.board_member (board_id, user_id) values (b1, pg_temp.uid('admin2'));
  perform pg_temp.logout();

  perform pg_temp.login('admin2');
  perform pg_temp.assert_that(exists (select 1 from public.list where board_id = b1), 'admin marcado no board passa a ver');
  perform pg_temp.logout();

  -- ── Board sem ninguém: admin enxerga para se pôr de volta ──
  delete from public.board_member where board_id = b1;
  perform pg_temp.login('admin2');
  perform pg_temp.assert_that(exists (select 1 from public.board where id = b1), 'admin vê board sem ninguém');
  perform pg_temp.assert_that(not exists (select 1 from public.list where board_id = b1), 'mas não o conteúdo');
  insert into public.board_member (board_id, user_id) values (b1, pg_temp.uid('admin2'));
  perform pg_temp.assert_that(exists (select 1 from public.list where board_id = b1), 'e se põe de volta');
  perform pg_temp.logout();
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(not exists (select 1 from public.board where id = b1), 'membro fora do board continua sem ver');
  perform pg_temp.logout();

  raise exception 'PASSOU: todos os testes da 0021 passaram';
end;
$$;
