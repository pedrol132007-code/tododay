-- Teste da 0018 (aviso de prazo na hora só quando outra pessoa definiu). Um bloco DO que termina SEMPRE com erro.
--   Passou: erro "PASSOU: todos os testes da 0018 passaram".
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

create or replace function pg_temp.assert_that(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FALHOU: %', p_what;
  end if;
end;
$$;


do $$
declare
  t bigint; b bigint; l_todo bigint;
  c1 bigint; c2 bigint;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_membro uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'membro']) n;
  v_membro := pg_temp.uid('membro');

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  insert into public.board (team_id, name, position) values (t, 'Board', 1) returning id into b;
  insert into public.list (board_id, name, position) values (b, 'A fazer', 1) returning id into l_todo;
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values (t, v_membro, 'member');
  -- Boards por pessoa (0020): todo mundo da equipe em todos os boards dela, como antes.
  insert into public.board_member (board_id, user_id)
    select bb.id, mm.user_id from public.board bb join public.team_member mm on mm.team_id = bb.team_id
    on conflict do nothing;

  -- ── Prazo no próprio card: sem aviso na hora ──
  perform pg_temp.login('membro');
  insert into public.card (list_id, title, position, assignee_id, due_date)
    values (l_todo, 'Criado por mim', 1, v_membro, v_today + 3) returning id into c1;
  perform pg_temp.logout();
  perform pg_temp.assert_that(not exists (select 1 from public.notification where card_id = c1),
    'criar o próprio card com prazo perto não avisa na hora');

  perform pg_temp.login('admin');
  insert into public.card (list_id, title, position, assignee_id) values (l_todo, 'Sem prazo', 2, v_membro)
    returning id into c2;
  perform pg_temp.logout();
  delete from public.notification where card_id = c2;
  perform pg_temp.login('membro');
  update public.card set due_date = v_today + 1 where id = c2;
  perform pg_temp.logout();
  perform pg_temp.assert_that(not exists (select 1 from public.notification where card_id = c2),
    'pôr prazo perto no próprio card não avisa na hora');

  -- O job do dia seguinte continua avisando.
  perform public.notify_due_dates();
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c1 and kind = 'due_3d') = 1,
    'o job avisa o prazo que a própria pessoa definiu');
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'due_1d') = 1,
    'o job avisa o de 1 dia também');

  -- ── Prazo definido por outra pessoa: continua avisando na hora ──
  perform pg_temp.login('admin');
  update public.card set due_date = v_today + 2 where id = c2;
  perform pg_temp.logout();
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'due_3d') = 1,
    'prazo definido por outra pessoa avisa na hora');

  raise exception 'PASSOU: todos os testes da 0018 passaram';
end;
$$;
