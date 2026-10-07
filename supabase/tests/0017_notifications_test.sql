-- Teste da 0017 (notificações). Um bloco DO que termina SEMPRE com erro.
--   Passou: erro "PASSOU: todos os testes da 0017 passaram".
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
  t bigint; b bigint; l_todo bigint; l_done bigint;
  c1 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_membro uuid;
  n_c2 bigint;
  n_aff bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'membro', 'outro', 'leitor']) n;
  v_membro := pg_temp.uid('membro');

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  insert into public.board (team_id, name, position) values (t, 'Board', 1) returning id into b;
  insert into public.list (board_id, name, position) values (b, 'A fazer', 1) returning id into l_todo;
  insert into public.list (board_id, name, position, status) values (b, 'Concluído', 2, 'done') returning id into l_done;
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values
    (t, v_membro, 'member'), (t, pg_temp.uid('outro'), 'member'), (t, pg_temp.uid('leitor'), 'viewer');
  update public.team_member set is_leader = true where team_id = t and user_id = pg_temp.uid('admin');

  -- ── Atribuição ──
  perform pg_temp.login('admin');
  insert into public.card (list_id, title, position, assignee_id, description)
    values (l_todo, 'Relatório', 1, v_membro, 'Detalhes') returning id into c1;
  insert into public.card (list_id, title, position, assignee_id) values (l_todo, 'Meu', 2, pg_temp.uid('admin'));
  perform pg_temp.logout();

  perform pg_temp.assert_that((select count(*) from public.notification where user_id = v_membro and kind = 'assigned' and card_id = c1) = 1,
    'atribuir a outra pessoa notifica');
  perform pg_temp.assert_that((select payload->>'actor_was_leader' from public.notification where card_id = c1 and kind = 'assigned') = 'true',
    'guarda que quem atribuiu era líder');
  perform pg_temp.assert_that((select payload->>'card_title' from public.notification where card_id = c1 and kind = 'assigned') = 'Relatório',
    'guarda o título');
  perform pg_temp.assert_that(not exists (select 1 from public.notification where user_id = pg_temp.uid('admin')),
    'atribuir a si mesmo não notifica');

  -- ── RLS ──
  perform pg_temp.login('outro');
  perform pg_temp.assert_that((select count(*) from public.notification) = 0, 'ninguém lê notificação dos outros');
  perform pg_temp.assert_that(pg_temp.affected('update public.notification set read_at = now()') = 0, 'ninguém marca a dos outros');
  perform pg_temp.logout();
  perform pg_temp.login('membro');
  perform pg_temp.assert_that((select count(*) from public.notification) = 1, 'cada um lê as próprias');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.notification (user_id, team_id, kind) values (%L, %s, %L)', v_membro, t, 'assigned')),
    'cliente não cria notificação');
  perform pg_temp.assert_that(pg_temp.fails('update public.notification set payload = ''{}''::jsonb'),
    'cliente só muda read_at');
  perform pg_temp.assert_that(pg_temp.fails('delete from public.notification'), 'cliente não apaga');
  perform pg_temp.assert_that(pg_temp.affected('update public.notification set read_at = now() where read_at is null') >= 1,
    'cada um marca as próprias como lidas');
  perform pg_temp.logout();
  update public.notification set read_at = null where card_id = c1;

  -- ── Ajuste logo depois de atribuir entra na própria atribuição ──
  perform pg_temp.login('admin');
  update public.card set due_date = v_today + 20 where id = c1;
  perform pg_temp.logout();
  perform pg_temp.assert_that(not exists (select 1 from public.notification where card_id = c1 and kind = 'changed'),
    'ajuste no primeiro minuto não vira mudança');
  perform pg_temp.assert_that((select payload->>'due_date' from public.notification where card_id = c1 and kind = 'assigned') = (v_today + 20)::text,
    'a atribuição mostra o prazo novo');

  -- ── Mudanças agrupadas ──
  update public.notification set created_at = now() - interval '2 minutes' where card_id = c1;
  perform pg_temp.login('admin');
  update public.card set description = 'Outra coisa' where id = c1;
  update public.card set list_id = l_done where id = c1;
  update public.card set list_id = l_todo where id = c1;
  perform pg_temp.logout();
  insert into public.card_attachment (card_id, name, mime_type, size_bytes, storage_path, uploaded_by, uploaded_by_name)
    values (c1, 'a.png', 'image/png', 1, c1 || '/' || gen_random_uuid(), pg_temp.uid('admin'), 'admin');
  insert into public.card_attachment (card_id, name, mime_type, size_bytes, storage_path, uploaded_by, uploaded_by_name)
    values (c1, 'b.png', 'image/png', 1, c1 || '/' || gen_random_uuid(), pg_temp.uid('admin'), 'admin');
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c1 and kind = 'changed') = 1,
    'mudanças não lidas do mesmo card ficam numa notificação só');
  perform pg_temp.assert_that((select payload->'changes' from public.notification where card_id = c1 and kind = 'changed')
    @> '["description","list","attachments"]'::jsonb, 'junta o que mudou');
  perform pg_temp.assert_that((select (payload->>'attachments')::int from public.notification where card_id = c1 and kind = 'changed') = 2,
    'soma os anexos');

  update public.notification set read_at = now() where card_id = c1;
  perform pg_temp.login('admin');
  update public.card set description = 'De novo' where id = c1;
  perform pg_temp.logout();
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c1 and kind = 'changed') = 2,
    'depois de lida, mudança nova cria outra');

  perform pg_temp.login('membro');
  n_aff := pg_temp.affected('update public.card set description = ''Eu mesmo'' where id = ' || c1);
  perform pg_temp.logout();
  perform pg_temp.assert_that(n_aff = 1, 'o membro conseguiu editar o próprio card');
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c1 and kind = 'changed') = 2,
    'quem mexe no próprio card não se notifica');

  -- Conflito direto: com uma mudança não lida já existente, o anexo novo entra nela (upsert).
  update public.notification set read_at = now() where card_id = c1;
  insert into public.notification (user_id, team_id, board_id, card_id, kind, payload)
    values (v_membro, t, b, c1, 'changed', '{"changes":["due_date"],"attachments":1}');
  insert into public.card_attachment (card_id, name, mime_type, size_bytes, storage_path, uploaded_by, uploaded_by_name)
    values (c1, 'c.png', 'image/png', 1, c1 || '/' || gen_random_uuid(), pg_temp.uid('admin'), 'admin');
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c1 and kind = 'changed' and read_at is null) = 1,
    'conflito: continua uma só não lida');
  perform pg_temp.assert_that((select (payload->>'attachments')::int from public.notification where card_id = c1 and kind = 'changed' and read_at is null) = 2,
    'conflito: soma os anexos');
  perform pg_temp.assert_that((select payload->'changes' from public.notification where card_id = c1 and kind = 'changed' and read_at is null)
    @> '["due_date","attachments"]'::jsonb, 'conflito: junta o que mudou');

  -- ── Avisos de prazo ──
  perform pg_temp.login('admin');
  insert into public.card (list_id, title, position, assignee_id, due_date)
    values (l_todo, 'Prazo', 3, v_membro, v_today + 3) returning id into c2;
  perform pg_temp.logout();
  perform pg_temp.assert_that((select (payload->>'days_left')::int from public.notification where card_id = c2 and kind = 'due_3d') = 3,
    'aviso de 3 dias sai na hora');
  perform public.notify_due_dates();
  perform public.notify_due_dates();
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'due_3d') = 1,
    'aviso de 3 dias sai uma vez só');
  perform public.notify_due_for_card(c2, v_today + 2);
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'due_1d') = 1, 'aviso de 1 dia');
  select count(*) into n_c2 from public.notification where card_id = c2;
  perform public.notify_due_for_card(c2, v_today + 3);
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2) = n_c2, 'sem aviso no dia do prazo');
  perform public.notify_due_for_card(c2, v_today + 4);
  perform public.notify_due_for_card(c2, v_today + 5);
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'overdue') = 1, 'atraso uma vez só');
  perform public.notify_due_for_card(c2, v_today + 30);
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'overdue') = 1, 'atraso antigo não volta');

  update public.card set due_date = v_today + 12 where id = c2;
  perform public.notify_due_for_card(c2, v_today + 10);
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'due_3d') = 2,
    'prazo novo libera avisos novos');

  perform pg_temp.login('admin');
  insert into public.card (list_id, title, position, assignee_id, due_date)
    values (l_done, 'Feito', 4, v_membro, v_today + 1) returning id into c3;
  insert into public.card (list_id, title, position, assignee_id, due_date)
    values (l_todo, 'Arquivado', 5, v_membro, v_today + 10) returning id into c4;
  update public.card set archived_at = now() where id = c4;
  insert into public.card (list_id, title, position, assignee_id, due_date)
    values (l_todo, 'Do leitor', 6, pg_temp.uid('leitor'), v_today + 1) returning id into c5;
  perform pg_temp.logout();
  perform public.notify_due_for_card(c4, v_today + 9);
  perform pg_temp.assert_that(not exists (select 1 from public.notification where card_id in (c3, c4) and kind <> 'assigned'),
    'card concluído ou arquivado não avisa prazo');
  perform pg_temp.assert_that(not exists (select 1 from public.notification where user_id = pg_temp.uid('leitor')),
    'leitor não recebe');

  -- Desativado não recebe: o card continua dele, mas mudanças não notificam. (Atribui antes de
  -- desativar: validate_card_assignee, 0013, recusa atribuir a quem já está desativado.)
  perform pg_temp.login('admin');
  update public.card set assignee_id = pg_temp.uid('outro') where id = c1;
  perform pg_temp.logout();
  delete from public.notification where user_id = pg_temp.uid('outro');
  update public.team_member set deactivated_at = now() where team_id = t and user_id = pg_temp.uid('outro');
  perform pg_temp.login('admin');
  update public.card set description = 'Depois de desativado' where id = c1;
  perform pg_temp.logout();
  perform pg_temp.assert_that(not exists (select 1 from public.notification where user_id = pg_temp.uid('outro')),
    'desativado não recebe');

  -- ── Limpeza ──
  insert into public.notification (user_id, team_id, kind, read_at, payload)
    values (v_membro, t, 'assigned', now() - interval '100 days', '{}');
  perform public.notify_due_dates();
  perform pg_temp.assert_that(not exists (select 1 from public.notification where read_at < now() - interval '90 days'),
    'lidas há mais de 90 dias são apagadas');

  perform pg_temp.assert_that(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notification'),
    'notification está no Realtime');

  raise exception 'PASSOU: todos os testes da 0017 passaram';
end;
$$;
