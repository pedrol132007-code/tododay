-- Teste da 0020 (líder único e boards por pessoa). Um bloco DO que termina SEMPRE com erro.
--   Passou: erro "PASSOU: todos os testes da 0020 passaram".
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
  t bigint; t_fora bigint; b1 bigint; b2 bigint; b3 bigint; l1 bigint; l2 bigint;
  c1 bigint; c2 bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'lider', 'membro', 'outro', 'leitor', 'estranho']) n;

  perform pg_temp.login('estranho');
  t_fora := public.create_team('Equipe de fora');
  perform pg_temp.logout();

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  insert into public.board (team_id, name, position) values (t, 'Board 1', 1) returning id into b1;
  insert into public.board (team_id, name, position) values (t, 'Board 2', 2) returning id into b2;
  insert into public.list (board_id, name, position) values (b1, 'A fazer', 1) returning id into l1;
  insert into public.list (board_id, name, position) values (b2, 'A fazer', 1) returning id into l2;
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values
    (t, pg_temp.uid('lider'), 'member'), (t, pg_temp.uid('membro'), 'member'),
    (t, pg_temp.uid('outro'), 'member'), (t, pg_temp.uid('leitor'), 'viewer');
  insert into public.board_member (board_id, user_id) values
    (b1, pg_temp.uid('membro')), (b1, pg_temp.uid('leitor')), (b2, pg_temp.uid('outro'));

  -- ── Líder único ──
  perform pg_temp.login('admin');
  update public.team_member set is_leader = true where team_id = t and user_id = pg_temp.uid('outro');
  update public.team_member set is_leader = true where team_id = t and user_id = pg_temp.uid('lider');
  perform pg_temp.assert_that((select count(*) from public.team_member where team_id = t and is_leader) = 1,
    'só um líder por equipe');
  perform pg_temp.assert_that((select user_id from public.team_member where team_id = t and is_leader) = pg_temp.uid('lider'),
    'a coroa passa para quem ganhou por último');
  perform pg_temp.assert_that(exists (select 1 from public.activity where team_id = t and action = 'member.leader_off'
    and payload->>'name' = 'outro'), 'a atividade registra que o anterior deixou de ser líder');
  insert into public.card (list_id, title, position, assignee_id) values (l2, 'Segredo do board 2', 1, pg_temp.uid('outro'))
    returning id into c2;
  perform pg_temp.logout();

  -- ── Membro só vê os boards dele ──
  perform pg_temp.login('membro');
  perform pg_temp.assert_that((select count(*) from public.board where team_id = t) = 1, 'membro vê só o board em que está');
  perform pg_temp.assert_that(not exists (select 1 from public.list where board_id = b2), 'membro não vê colunas de outro board');
  perform pg_temp.assert_that(not exists (select 1 from public.card where id = c2), 'membro não vê cards de outro board');
  perform pg_temp.assert_that(not exists (select 1 from public.card_status_history where board_id = b2),
    'membro não vê o histórico de outro board');
  perform pg_temp.assert_that(not exists (select 1 from public.activity where board_id = b2),
    'membro não vê a atividade de outro board');
  perform pg_temp.assert_that(exists (select 1 from public.activity where team_id = t and board_id is null),
    'membro continua vendo a atividade da equipe');
  perform pg_temp.assert_that(not exists (select 1 from public.board_member where board_id = b2),
    'membro não vê quem está em outro board');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.card (list_id, title, position) values (%s, %L, 2)', l2, 'x')), 'membro não cria card em outro board');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.board (team_id, name, position) values (%s, %L, 3)', t, 'x')), 'membro não cria board');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.board_member (board_id, user_id) values (%s, %L)', b1, pg_temp.uid('outro'))),
    'membro não escolhe as pessoas do board');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.board set name = %L where id = %s', 'x', b1)) = 0,
    'membro não renomeia board');
  -- Colunas: cria, renomeia, reordena; não muda tipo/limite nem exclui.
  perform pg_temp.assert_that(not pg_temp.fails(format(
    'insert into public.list (board_id, name, position) values (%s, %L, 2)', b1, 'Do membro')), 'membro cria coluna');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.list (board_id, name, position, status) values (%s, %L, 3, %L)', b1, 'Feito', 'done')),
    'membro não cria coluna com tipo');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.list set name = %L where id = %s', 'Backlog', l1)) = 1,
    'membro renomeia coluna');
  perform pg_temp.assert_that(pg_temp.fails(format('update public.list set status = %L where id = %s', 'doing', l1)),
    'membro não muda o tipo');
  perform pg_temp.assert_that(pg_temp.fails(format('update public.list set wip_limit = 2 where id = %s', l1)),
    'membro não muda o limite');
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.list where id = %s', l1)) = 0,
    'membro não exclui coluna');
  perform pg_temp.logout();

  -- ── Leitor: vê o board dele e só lê ──
  perform pg_temp.login('leitor');
  perform pg_temp.assert_that((select count(*) from public.board where team_id = t) = 1, 'leitor vê só o board em que está');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.list (board_id, name, position) values (%s, %L, 9)', b1, 'x')), 'leitor não cria coluna');
  perform pg_temp.logout();

  -- ── Líder ──
  perform pg_temp.login('lider');
  perform pg_temp.assert_that((select count(*) from public.board where team_id = t) = 2, 'líder vê todos os boards');
  perform pg_temp.assert_that(exists (select 1 from public.card where id = c2), 'líder vê os cards de todos os boards');
  insert into public.board (team_id, name, position) values (t, 'Do líder', 3) returning id into b3;
  perform pg_temp.assert_that(exists (select 1 from public.board_member where board_id = b3 and user_id = pg_temp.uid('lider')),
    'quem cria o board entra nele');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.board set name = %L where id = %s', 'Board dois', b2)) = 1,
    'líder renomeia board');
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.board where id = %s', b2)) = 0,
    'líder não exclui board');
  update public.list set status = 'doing', wip_limit = 3 where id = l1;
  perform pg_temp.assert_that((select wip_limit from public.list where id = l1) = 3, 'líder muda tipo e limite');
  insert into public.board_member (board_id, user_id) values (b3, pg_temp.uid('membro'));
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.board_member (board_id, user_id) values (%s, %L)', b3, pg_temp.uid('estranho'))),
    'só entra no board quem é da equipe');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.card (list_id, title, position, assignee_id) values (%s, %L, 2, %L)', l1, 'x', pg_temp.uid('outro'))),
    'não atribui card a quem não participa do board');
  insert into public.card (list_id, title, position, assignee_id) values (l1, 'Do membro', 3, pg_temp.uid('membro'))
    returning id into c1;
  -- Tirar do board desatribui.
  delete from public.board_member where board_id = b2 and user_id = pg_temp.uid('outro');
  perform pg_temp.assert_that((select assignee_id from public.card where id = c2) is null,
    'tirar alguém do board desatribui os cards dele ali');
  perform pg_temp.logout();

  perform pg_temp.login('membro');
  perform pg_temp.assert_that((select count(*) from public.board where team_id = t) = 2, 'entrar num board faz ele aparecer');
  perform pg_temp.assert_that(exists (select 1 from public.card where id = c1), 'membro vê o card atribuído a ele');
  perform pg_temp.logout();

  -- ── A coroa passa: o ex-líder fica só com os boards em que está ──
  perform pg_temp.login('admin');
  update public.team_member set is_leader = true where team_id = t and user_id = pg_temp.uid('membro');
  perform pg_temp.logout();
  perform pg_temp.login('lider');
  perform pg_temp.assert_that((select count(*) from public.board where team_id = t) = 1,
    'ex-líder vê só o board que criou');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.board (team_id, name, position) values (%s, %L, 9)', t, 'x')), 'ex-líder não cria board');
  perform pg_temp.logout();

  -- ── Sair da equipe tira dos boards ──
  delete from public.team_member where team_id = t and user_id = pg_temp.uid('leitor');
  perform pg_temp.assert_that(not exists (select 1 from public.board_member where user_id = pg_temp.uid('leitor')),
    'sair da equipe tira dos boards dela');

  perform pg_temp.assert_that(t_fora is not null, 'equipe de fora criada');
  raise exception 'PASSOU: todos os testes da 0020 passaram';
end;
$$;
