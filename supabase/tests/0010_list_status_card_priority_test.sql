-- Teste da 0010 (tipo da coluna, prioridade e entrada na coluna). Rode inteiro no SQL Editor
-- depois de aplicar a migration. Um bloco DO que termina SEMPRE com erro, para desfazer tudo.
--   Passou: erro "PASSOU: todos os testes da 0010 passaram".
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
  t bigint; b bigint; l_todo bigint; l_doing bigint; c bigint; entered timestamptz;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'leitor']) n;

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  insert into public.board (team_id, name, position) values (t, 'Board', 1) returning id into b;
  insert into public.list (board_id, name, position) values (b, 'Backlog', 1) returning id into l_todo;
  insert into public.list (board_id, name, position, status) values (b, 'Fazendo', 2, 'doing') returning id into l_doing;
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values (t, pg_temp.uid('leitor'), 'viewer');

  perform pg_temp.login('admin');
  perform pg_temp.assert_that((select status from public.list where id = l_todo) = 'todo', 'coluna nova começa como todo');
  perform pg_temp.assert_that(pg_temp.fails(format('update public.list set status = %L where id = %s', 'pausado', l_todo)),
    'status fora da lista é recusado');
  update public.list set status = 'done' where id = l_todo;
  perform pg_temp.assert_that((select status from public.list where id = l_todo) = 'done', 'membro/admin troca o status da coluna');
  update public.list set status = 'todo' where id = l_todo;

  insert into public.card (list_id, title, position, list_entered_at) values (l_todo, 'Card', 1, now() - interval '30 days')
    returning id into c;
  perform pg_temp.assert_that((select priority from public.card where id = c) is null, 'card novo sem prioridade');
  perform pg_temp.assert_that((select list_entered_at from public.card where id = c) > now() - interval '1 minute',
    'ao criar, list_entered_at é o relógio do servidor (ignora o valor enviado)');
  perform pg_temp.assert_that(pg_temp.fails(format('update public.card set priority = %L where id = %s', 'altissima', c)),
    'prioridade fora da lista é recusada');
  update public.card set priority = 'urgent' where id = c;
  perform pg_temp.assert_that((select priority from public.card where id = c) = 'urgent', 'define prioridade');

  -- Simula um card antigo (como superusuário o trigger também roda, então desliga só para preparar).
  perform pg_temp.logout();
  alter table public.card disable trigger card_touch_list_entered_at;
  update public.card set list_entered_at = now() - interval '10 days' where id = c;
  alter table public.card enable trigger card_touch_list_entered_at;
  entered := (select list_entered_at from public.card where id = c);

  perform pg_temp.login('admin');
  update public.card set title = 'Card renomeado', priority = 'low', list_entered_at = now() where id = c;
  perform pg_temp.assert_that((select list_entered_at from public.card where id = c) = entered,
    'editar sem trocar de coluna não mexe em list_entered_at (nem se o app tentar)');
  update public.card set list_id = l_doing where id = c;
  perform pg_temp.assert_that((select list_entered_at from public.card where id = c) > now() - interval '1 minute',
    'trocar de coluna atualiza list_entered_at');
  perform pg_temp.logout();

  perform pg_temp.login('leitor');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.list set status = %L where id = %s', 'done', l_doing)) = 0,
    'leitor não troca o status da coluna');
  perform pg_temp.assert_that(pg_temp.affected(format('update public.card set priority = %L where id = %s', 'high', c)) = 0,
    'leitor não troca a prioridade');
  perform pg_temp.logout();

  raise exception 'PASSOU: todos os testes da 0010 passaram (e nada ficou gravado)';
end;
$$;
