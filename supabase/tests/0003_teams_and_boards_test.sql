-- Teste de RLS da 0003. Rode inteiro no SQL Editor depois de aplicar as migrations.
--
-- O SQL Editor não guarda configurações de uma instrução para a outra, então o teste
-- inteiro roda dentro de um único bloco DO, que termina SEMPRE com um erro proposital
-- para desfazer tudo o que criou.
--   Passou: erro "PASSOU: todos os testes de permissão passaram".
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
  t bigint; t2 bigint;
  b bigint; l bigint; l2 bigint; c bigint; lb bigint;
  b_outro bigint; l_outro bigint; lb_outro bigint;
begin
  -- ── usuários e equipes
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'membro', 'leitor', 'estranho']) n;

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  perform pg_temp.logout();

  -- Convites chegam na E6; por enquanto os membros entram direto.
  insert into public.team_member (team_id, user_id, role, job_title)
  select t, pg_temp.uid(n), r::public.member_role, 'Cargo ' || n
  from (values ('membro', 'member'), ('leitor', 'viewer')) as x(n, r);

  perform pg_temp.login('estranho');
  t2 := public.create_team('Equipe do Estranho');
  perform pg_temp.logout();

  -- ── admin
  perform pg_temp.login('admin');
  perform pg_temp.assert_that((select role from public.team_member where team_id = t and user_id = auth.uid()) = 'admin',
    'create_team deixa quem criou como admin');
  insert into public.board (team_id, name, position) values (t, 'Board', 1) returning id into b;
  perform pg_temp.logout();

  -- ── membro
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.board') = 1, 'membro vê o board da equipe');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.team_member') = 3, 'membro vê os 3 membros');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.profile') = 3, 'membro vê perfis dos colegas (e só deles)');
  insert into public.list (board_id, name, position) values (b, 'A fazer', 1) returning id into l;
  insert into public.list (board_id, name, position) values (b, 'Feito', 2) returning id into l2;
  insert into public.card (list_id, title, position) values (l, 'Card', 1) returning id into c;
  perform pg_temp.assert_that((select board_id from public.card where id = c) = b, 'card.board_id preenchido pelo trigger');
  update public.card set list_id = l2 where id = c;
  perform pg_temp.assert_that((select board_id from public.card where id = c) = b, 'card.board_id continua certo ao mover');
  insert into public.label (board_id, name, color) values (b, 'Urgente', '#f00') returning id into lb;
  insert into public.card_label values (c, lb);
  insert into public.checklist_item (card_id, text, position) values (c, 'Item', 1);
  perform pg_temp.assert_that(pg_temp.affected(format('update public.checklist_item set done = true where card_id = %s', c)) = 1,
    'membro marca item do checklist');
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.board where id = %s', b)) = 0, 'membro não apaga board');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.team set name = %L where id = %s', 'x', t)) = 0,
    'membro não renomeia equipe');
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.team where id = %s', t)) = 0, 'membro não apaga equipe');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.team_member set role = %L where team_id = %s and user_id = auth.uid()', 'admin', t)) = 0,
    'membro não se promove a admin');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'delete from public.team_member where team_id = %s and user_id = %L', t, pg_temp.uid('leitor'))) = 0,
    'membro não remove outro membro');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.team_member (team_id, user_id, role) values (%s, %L, %L)', t, pg_temp.uid('estranho'), 'member')),
    'membro não adiciona gente na equipe');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.team (name, created_by) values (%L, auth.uid())', 'Direto')),
    'ninguém cria equipe sem create_team');
  perform pg_temp.logout();

  -- ── leitor
  perform pg_temp.login('leitor');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.card') = 1, 'leitor vê o card');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.card_label') = 1, 'leitor vê a label do card');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.checklist_item') = 1, 'leitor vê o checklist');
  perform pg_temp.assert_that(pg_temp.fails(format('insert into public.card (list_id, title, position) values (%s, %L, 2)', l, 'x')),
    'leitor não cria card');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.card set title = %L where id = %s', 'x', c)) = 0,
    'leitor não edita card');
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.card where id = %s', c)) = 0, 'leitor não apaga card');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.checklist_item set done = false where card_id = %s', c)) = 0,
    'leitor não marca checklist');
  perform pg_temp.assert_that(pg_temp.fails(format('insert into public.board (team_id, name, position) values (%s, %L, 2)', t, 'x')),
    'leitor não cria board');
  perform pg_temp.logout();

  -- ── estranho
  perform pg_temp.login('estranho');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.team') = 1, 'estranho só vê a própria equipe');
  perform pg_temp.assert_that(pg_temp.row_count(format('select * from public.board where team_id = %s', t)) = 0, 'estranho não vê o board');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.list') = 0, 'estranho não vê colunas');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.card') = 0, 'estranho não vê cards');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.label') = 0, 'estranho não vê labels');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.checklist_item') = 0, 'estranho não vê checklist');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.team_member') = 1, 'estranho só vê o próprio vínculo');
  perform pg_temp.assert_that(pg_temp.row_count('select * from public.profile') = 1, 'estranho só vê o próprio perfil');
  perform pg_temp.assert_that(pg_temp.fails(format('insert into public.board (team_id, name, position) values (%s, %L, 2)', t, 'x')),
    'estranho não cria board na equipe dos outros');
  perform pg_temp.assert_that(pg_temp.fails(format('insert into public.list (board_id, name, position) values (%s, %L, 3)', b, 'x')),
    'estranho não cria coluna no board dos outros');
  perform pg_temp.assert_that(pg_temp.fails(format('insert into public.card (list_id, title, position) values (%s, %L, 2)', l, 'x')),
    'estranho não cria card na coluna dos outros');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.card set title = %L where id = %s', 'x', c)) = 0,
    'estranho não edita card');
  -- board próprio, para testar mistura entre equipes
  insert into public.board (team_id, name, position) values (t2, 'Board do estranho', 1) returning id into b_outro;
  insert into public.list (board_id, name, position) values (b_outro, 'Coluna', 1) returning id into l_outro;
  insert into public.label (board_id, name, color) values (b_outro, 'Label', '#0f0') returning id into lb_outro;
  perform pg_temp.assert_that(pg_temp.fails(format('update public.list set board_id = %s where id = %s', b, l_outro)),
    'coluna não muda de board');
  perform pg_temp.logout();

  -- ── mistura entre equipes (como postgres, dando ao membro acesso de leitor na equipe do estranho)
  insert into public.team_member (team_id, user_id, role) values (t2, pg_temp.uid('membro'), 'viewer');
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(pg_temp.fails(format('update public.card set list_id = %s where id = %s', l_outro, c)),
    'membro não move card para board onde é só leitor');
  perform pg_temp.assert_that(pg_temp.fails(format('insert into public.card_label values (%s, %s)', c, lb_outro)),
    'label de outro board não entra no card');
  -- sair da equipe
  perform pg_temp.assert_that(pg_temp.affected(format(
    'delete from public.team_member where team_id = %s and user_id = auth.uid()', t2)) = 1, 'membro pode sair da equipe');
  perform pg_temp.logout();

  -- ── admin: gerenciar membros e último admin
  perform pg_temp.login('admin');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.team_member set job_title = %L where team_id = %s and user_id = %L', 'Designer', t, pg_temp.uid('leitor'))) = 1,
    'admin muda cargo');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.team_member set user_id = %L where team_id = %s and user_id = %L', pg_temp.uid('estranho'), t, pg_temp.uid('leitor'))),
    'admin não troca o user_id de um vínculo');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.team_member set role = %L where team_id = %s and user_id = auth.uid()', 'member', t)),
    'último admin não se rebaixa');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'delete from public.team_member where team_id = %s and user_id = auth.uid()', t)),
    'último admin não sai da equipe');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.team_member set role = %L where team_id = %s and user_id = %L', 'admin', t, pg_temp.uid('membro'))) = 1,
    'admin promove membro');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.team_member set role = %L where team_id = %s and user_id = auth.uid()', 'member', t)) = 1,
    'com outro admin, pode se rebaixar');
  perform pg_temp.logout();

  perform pg_temp.login('membro'); -- agora admin
  perform pg_temp.assert_that(pg_temp.affected(format(
    'delete from public.team_member where team_id = %s and user_id = %L', t, pg_temp.uid('leitor'))) = 1,
    'admin remove membro');
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.board where id = %s', b)) = 1, 'admin apaga board');
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.team where id = %s', t)) = 1,
    'admin apaga equipe (a proteção do último admin não bloqueia a cascata)');
  perform pg_temp.logout();

  -- ── apagar a conta de um admin único também não trava
  delete from auth.users where id = pg_temp.uid('estranho');
  perform pg_temp.assert_that(not exists (select 1 from public.team where id = t2 and created_by is not null),
    'conta apagada: team.created_by vira nulo');

  -- ── sem login
  perform set_config('role', 'anon', true);
  perform pg_temp.assert_that(pg_temp.fails('select * from public.board'), 'anon não lê board');
  perform pg_temp.logout();

  raise exception 'PASSOU: todos os testes de permissão passaram (e nada ficou gravado)';
end;
$$;
