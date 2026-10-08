-- Teste da 0012 (histórico de status dos cards). Rode inteiro no SQL Editor depois de aplicar a
-- migration. Um bloco DO que termina SEMPRE com erro, para desfazer tudo.
--   Passou: erro "PASSOU: todos os testes da 0012 passaram".
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


-- Os status gravados para um card, do mais antigo ao mais novo, como texto ("todo,doing").
create or replace function pg_temp.trail(p_card bigint) returns text language sql security definer as $$
  select coalesce(string_agg(status, ',' order by id), '') from public.card_status_history where card_id = p_card;
$$;

do $$
declare
  t bigint; b bigint; l_todo bigint; l_todo2 bigint; l_doing bigint; l_done bigint;
  c bigint; c2 bigint; c_arch bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'membro', 'leitor', 'estranho']) n;

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  insert into public.board (team_id, name, position) values (t, 'Board', 1) returning id into b;
  insert into public.list (board_id, name, position) values (b, 'Backlog', 1) returning id into l_todo;
  insert into public.list (board_id, name, position) values (b, 'Ideias', 2) returning id into l_todo2;
  insert into public.list (board_id, name, position, status) values (b, 'Fazendo', 3, 'doing') returning id into l_doing;
  insert into public.list (board_id, name, position, status) values (b, 'Pronto', 4, 'done') returning id into l_done;
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values
    (t, pg_temp.uid('membro'), 'member'), (t, pg_temp.uid('leitor'), 'viewer');
  -- Boards por pessoa (0020): todo mundo da equipe em todos os boards dela, como antes.
  insert into public.board_member (board_id, user_id)
    select bb.id, mm.user_id from public.board bb join public.team_member mm on mm.team_id = bb.team_id
    on conflict do nothing;

  perform pg_temp.login('membro');
  insert into public.card (list_id, title, position) values (l_todo, 'Card', 1) returning id into c;
  perform pg_temp.assert_that(pg_temp.trail(c) = 'todo', 'card criado grava o status da coluna em que nasceu');
  perform pg_temp.assert_that((select board_id from public.card_status_history where card_id = c) = b,
    'a linha leva o board do card');

  update public.card set list_id = l_todo2 where id = c;
  perform pg_temp.assert_that(pg_temp.trail(c) = 'todo', 'mudar para outra coluna do mesmo tipo não grava nada');
  update public.card set title = 'Card renomeado', priority = 'high' where id = c;
  perform pg_temp.assert_that(pg_temp.trail(c) = 'todo', 'editar o card sem trocar de coluna não grava nada');

  update public.card set list_id = l_doing where id = c;
  perform pg_temp.assert_that(pg_temp.trail(c) = 'todo,doing', 'ir para uma coluna de outro tipo grava o novo status');
  update public.card set list_id = l_done, position = 1 where id = c;
  perform public.set_card_positions(jsonb_build_array(jsonb_build_object('id', c, 'position', 5)));
  perform pg_temp.assert_that(pg_temp.trail(c) = 'todo,doing,done', 'concluir grava done; reordenar não grava nada');

  -- Mexer na coluna é do admin desde a 0013.
  perform pg_temp.logout();
  perform pg_temp.login('admin');
  update public.list set name = 'Entregue' where id = l_done;
  perform pg_temp.assert_that((select name from public.list where id = l_done) = 'Entregue', 'admin renomeia a coluna');
  perform pg_temp.assert_that(pg_temp.trail(c) = 'todo,doing,done', 'renomear a coluna não grava nada');
  perform pg_temp.logout();
  perform pg_temp.login('membro');

  -- Um card arquivado na coluna que vai mudar de tipo: fica de fora até voltar.
  insert into public.card (list_id, title, position) values (l_todo2, 'Outro', 2) returning id into c2;
  insert into public.card (list_id, title, position) values (l_todo2, 'Arquivado', 3) returning id into c_arch;
  update public.card set archived_at = now() where id = c_arch;
  perform pg_temp.assert_that(pg_temp.trail(c_arch) = 'todo', 'arquivar não grava status');

  perform pg_temp.logout();
  perform pg_temp.login('admin');
  update public.list set status = 'doing' where id = l_todo2;
  perform pg_temp.logout();
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(pg_temp.trail(c2) = 'todo,doing', 'coluna que muda de tipo grava o novo status dos cards nela');
  perform pg_temp.assert_that(pg_temp.trail(c_arch) = 'todo', 'mas não o dos arquivados');
  perform pg_temp.assert_that(pg_temp.trail(c) = 'todo,doing,done', 'e não mexe nos cards de outras colunas');
  update public.card set archived_at = null where id = c_arch;
  perform pg_temp.assert_that(pg_temp.trail(c_arch) = 'todo,doing', 'desarquivar grava o status atual da coluna, se mudou');

  -- Ninguém escreve à mão no histórico.
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.card_status_history (card_id, board_id, status) values (%s, %s, %L)', c, b, 'done')),
    'membro não insere no histórico');
  perform pg_temp.assert_that(pg_temp.fails(format('update public.card_status_history set status = %L where card_id = %s', 'todo', c)),
    'membro não altera o histórico');
  perform pg_temp.assert_that(pg_temp.fails(format('delete from public.card_status_history where card_id = %s', c)),
    'membro não apaga o histórico');
  perform pg_temp.logout();

  perform pg_temp.login('leitor');
  perform pg_temp.assert_that((select count(*) from public.card_status_history where card_id = c) = 3,
    'leitor da equipe vê o histórico');
  perform pg_temp.logout();

  perform pg_temp.login('estranho');
  perform pg_temp.assert_that((select count(*) from public.card_status_history where board_id = b) = 0,
    'quem não é da equipe não vê nada');
  perform pg_temp.logout();

  perform pg_temp.login('admin');
  delete from public.card where id = c;
  perform pg_temp.logout();
  perform pg_temp.assert_that(pg_temp.trail(c) = '', 'apagar o card apaga o histórico dele');

  raise exception 'PASSOU: todos os testes da 0012 passaram (e nada ficou gravado)';
end;
$$;
