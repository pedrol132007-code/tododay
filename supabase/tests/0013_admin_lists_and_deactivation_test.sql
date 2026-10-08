-- Teste da 0013 (estrutura do board só para admin; desativar membro). Rode inteiro no SQL Editor
-- depois de aplicar a migration. Um bloco DO que termina SEMPRE com erro, para desfazer tudo.
--   Passou: erro "PASSOU: todos os testes da 0013 passaram".
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
  t bigint; b bigint; l1 bigint; l2 bigint; c_membro bigint; c_admin bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'admin2', 'membro', 'leitor']) n;

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  insert into public.board (team_id, name, position) values (t, 'Board', 1) returning id into b;
  insert into public.list (board_id, name, position) values (b, 'A fazer', 1) returning id into l1;
  insert into public.list (board_id, name, position, status) values (b, 'Fazendo', 2, 'doing') returning id into l2;
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values
    (t, pg_temp.uid('admin2'), 'admin'), (t, pg_temp.uid('membro'), 'member'), (t, pg_temp.uid('leitor'), 'viewer');
  -- Boards por pessoa (0020): todos no board.
  insert into public.board_member (board_id, user_id) select b, m.user_id from public.team_member m where m.team_id = t
    on conflict do nothing;

  -- ── Membro usa o board e cria, renomeia e reordena colunas (0020), mas não muda tipo, limite nem exclui ──
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(not pg_temp.fails(format(
    'insert into public.list (board_id, name, position) values (%s, %L, 3)', b, 'Nova')), 'membro cria coluna (0020)');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.list set name = %L where id = %s', 'A fazer', l1)) = 1,
    'membro renomeia coluna (0020)');
  perform pg_temp.assert_that(pg_temp.fails(format('update public.list set wip_limit = 3 where id = %s', l1)),
    'membro não muda o limite de WIP');
  perform pg_temp.assert_that(pg_temp.fails(format('update public.list set status = %L where id = %s', 'done', l1)),
    'membro não muda o tipo da coluna');
  perform public.set_list_positions(jsonb_build_array(jsonb_build_object('id', l1, 'position', 9)));
  perform pg_temp.assert_that((select position from public.list where id = l1) = 9, 'membro reordena colunas (0020)');
  update public.list set position = 1 where id = l1;
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.list where id = %s', l1)) = 0,
    'membro não exclui coluna');
  perform pg_temp.logout();
  delete from public.list where board_id = b and name = 'Nova';
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.board (team_id, name, position) values (%s, %L, 2)', t, 'Outro')), 'membro não cria board');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.board set name = %L where id = %s', 'X', b)) = 0,
    'membro não renomeia board');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.team_member set role = %L where team_id = %s and user_id = %L', 'admin', t, pg_temp.uid('membro'))) = 0,
    'membro não muda papéis');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.team_member set deactivated_at = now() where team_id = %s and user_id = %L', t, pg_temp.uid('admin2'))) = 0,
    'membro não desativa ninguém');

  insert into public.card (list_id, title, position, assignee_id) values (l1, 'Do membro', 1, pg_temp.uid('membro'))
    returning id into c_membro;
  update public.card set list_id = l2 where id = c_membro;
  perform pg_temp.assert_that((select list_id from public.card where id = c_membro) = l2, 'membro cria e move cards');
  perform pg_temp.logout();

  -- ── Admin mexe na estrutura ──
  perform pg_temp.login('admin');
  update public.list set name = 'Backlog', wip_limit = 5, status = 'todo' where id = l1;
  perform pg_temp.assert_that((select wip_limit from public.list where id = l1) = 5, 'admin muda nome, WIP e tipo da coluna');
  insert into public.board (team_id, name, position) values (t, 'Segundo', 2);
  perform pg_temp.assert_that((select count(*) from public.board where team_id = t) = 2, 'admin cria board');

  -- ── Desativar ──
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.team_member set deactivated_at = now() where team_id = %s and user_id = %L', t, pg_temp.uid('admin'))),
    'admin não desativa a si mesmo');
  update public.team_member set deactivated_at = now() where team_id = t and user_id = pg_temp.uid('membro');
  perform pg_temp.assert_that((select count(*) from public.activity where team_id = t and action = 'member.deactivated') = 1,
    'desativar entra no histórico da equipe');
  perform pg_temp.assert_that((select assignee_id from public.card where id = c_membro) = pg_temp.uid('membro'),
    'os cards do desativado continuam com ele como responsável');
  update public.card set list_id = l1 where id = c_membro;
  perform pg_temp.assert_that((select list_id from public.card where id = c_membro) = l1,
    'o card de quem foi desativado continua andando');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.card (list_id, title, position, assignee_id) values (%s, %L, 2, %L)', l1, 'Novo', pg_temp.uid('membro'))),
    'não dá para atribuir um card novo a quem está desativado');
  perform pg_temp.assert_that((select display_name from public.profile where id = pg_temp.uid('membro')) = 'membro',
    'a equipe continua vendo o nome de quem foi desativado');
  insert into public.card (list_id, title, position) values (l1, 'Do admin', 3) returning id into c_admin;
  perform pg_temp.logout();

  perform pg_temp.login('membro');
  perform pg_temp.assert_that(public.team_role(t) is null, 'desativado não tem papel na equipe');
  perform pg_temp.assert_that((select count(*) from public.team where id = t) = 0, 'desativado não vê a equipe');
  perform pg_temp.assert_that((select count(*) from public.board where team_id = t) = 0, 'desativado não vê os boards');
  perform pg_temp.assert_that((select count(*) from public.card where board_id = b) = 0, 'desativado não vê os cards');
  perform pg_temp.assert_that((select count(*) from public.profile where id <> pg_temp.uid('membro')) = 0,
    'desativado não vê os perfis dos colegas');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.card (list_id, title, position) values (%s, %L, 9)', l1, 'Tentativa')), 'desativado não cria card');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.card set title = %L where id = %s', 'X', c_admin)) = 0,
    'desativado não edita card');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.team_member set deactivated_at = null where team_id = %s and user_id = %L', t, pg_temp.uid('membro'))) = 0,
    'desativado não se reativa sozinho');
  perform pg_temp.logout();

  -- ── Último admin ativo ──
  perform pg_temp.login('admin');
  update public.team_member set deactivated_at = now() where team_id = t and user_id = pg_temp.uid('admin2');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.team_member set role = %L where team_id = %s and user_id = %L', 'member', t, pg_temp.uid('admin'))),
    'o último admin ativo não deixa de ser admin (o outro admin está desativado)');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'delete from public.team_member where team_id = %s and user_id = %L', t, pg_temp.uid('admin'))),
    'o último admin ativo não sai da equipe');

  -- ── Reativar devolve o acesso ──
  update public.team_member set deactivated_at = null where team_id = t and user_id = pg_temp.uid('membro');
  perform pg_temp.assert_that((select count(*) from public.activity where team_id = t and action = 'member.reactivated') = 1,
    'reativar entra no histórico da equipe');
  perform pg_temp.logout();
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(public.team_role(t) = 'member', 'reativado volta a ser membro');
  perform pg_temp.assert_that((select count(*) from public.card where board_id = b) = 2, 'e volta a ver os cards');
  perform pg_temp.logout();

  -- ── Leitor continua só lendo ──
  perform pg_temp.login('leitor');
  perform pg_temp.assert_that((select count(*) from public.list where board_id = b) = 2, 'leitor vê as colunas');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.card set title = %L where id = %s', 'X', c_admin)) = 0,
    'leitor não edita card');
  perform pg_temp.logout();

  raise exception 'PASSOU: todos os testes da 0013 passaram (e nada ficou gravado)';
end;
$$;
