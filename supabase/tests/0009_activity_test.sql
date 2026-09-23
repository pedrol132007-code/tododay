-- Teste da 0009 (histórico de atividade). Rode inteiro no SQL Editor depois de aplicar a migration.
-- Mesmo formato dos outros testes: um bloco DO que termina SEMPRE com erro, para desfazer tudo.
--   Passou: erro "PASSOU: todos os testes da 0009 passaram".
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


-- Última entrada do histórico com essa ação (lida como postgres, sem RLS).
create or replace function pg_temp.last(p_action text) returns public.activity language sql security definer as $$
  select * from public.activity where action = p_action order by id desc limit 1;
$$;

do $$
declare
  t bigint; b bigint; l bigint; l2 bigint; c bigint; lb bigint; ci bigint; n_before bigint;
  a public.activity;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'membro', 'estranho']) n;

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  a := pg_temp.last('member.joined');
  perform pg_temp.assert_that(a.team_id = t and a.actor_name = 'admin' and a.payload ->> 'role' = 'admin',
    'criar equipe registra a entrada do admin');

  insert into public.board (team_id, name, position) values (t, 'Board', 1) returning id into b;
  perform pg_temp.assert_that((pg_temp.last('board.created')).payload ->> 'name' = 'Board', 'board criado');
  insert into public.list (board_id, name, position) values (b, 'A fazer', 1) returning id into l;
  insert into public.list (board_id, name, position) values (b, 'Feito', 2) returning id into l2;
  perform pg_temp.assert_that((pg_temp.last('list.created')).payload ->> 'name' = 'Feito', 'coluna criada');
  update public.list set name = 'Pronto' where id = l2;
  perform pg_temp.assert_that((pg_temp.last('list.renamed')).payload ->> 'from' = 'Feito', 'coluna renomeada');

  -- ── card
  insert into public.card (list_id, title, position) values (l, 'Login', 1) returning id into c;
  a := pg_temp.last('card.created');
  perform pg_temp.assert_that(a.card_id = c and a.board_id = b and a.payload ->> 'list' = 'A fazer', 'card criado');
  update public.card set title = 'Tela de login' where id = c;
  perform pg_temp.assert_that((pg_temp.last('card.renamed')).payload ->> 'from' = 'Login', 'card renomeado');
  update public.card set list_id = l2, position = 1 where id = c;
  a := pg_temp.last('card.moved');
  perform pg_temp.assert_that(a.payload ->> 'from' = 'A fazer' and a.payload ->> 'to' = 'Pronto', 'card movido');

  select count(*) into n_before from public.activity;
  update public.card set position = 5 where id = c;
  perform public.set_card_positions(jsonb_build_array(jsonb_build_object('id', c, 'position', 1)));
  perform pg_temp.assert_that((select count(*) from public.activity) = n_before, 'só mudar a posição não entra no histórico');

  update public.card set description = 'x' where id = c;
  perform pg_temp.assert_that((pg_temp.last('card.description_changed')).id is not null, 'descrição editada');
  update public.card set due_date = '2026-10-05' where id = c;
  perform pg_temp.assert_that((pg_temp.last('card.due_date_changed')).payload ->> 'to' = '2026-10-05', 'vencimento');
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values (t, pg_temp.uid('membro'), 'member');
  perform pg_temp.login('admin');
  update public.card set assignee_id = pg_temp.uid('membro') where id = c;
  perform pg_temp.assert_that((pg_temp.last('card.assigned')).payload ->> 'name' = 'membro', 'responsável');
  update public.card set assignee_id = null where id = c;
  perform pg_temp.assert_that((pg_temp.last('card.unassigned')).payload ->> 'name' = 'membro', 'tirou responsável');

  insert into public.label (board_id, name, color) values (b, 'Urgente', '#f00') returning id into lb;
  insert into public.card_label values (c, lb);
  perform pg_temp.assert_that((pg_temp.last('label.added')).payload ->> 'label' = 'Urgente', 'label adicionada');
  insert into public.checklist_item (card_id, text, position) values (c, 'Testar', 1) returning id into ci;
  update public.checklist_item set done = true where id = ci;
  perform pg_temp.assert_that((pg_temp.last('checklist.checked')).payload ->> 'item' = 'Testar', 'checklist marcado');

  update public.card set archived_at = now() where id = c;
  perform pg_temp.assert_that((pg_temp.last('card.archived')).id is not null, 'arquivado');
  update public.card set archived_at = null where id = c;
  perform pg_temp.assert_that((pg_temp.last('card.restored')).id is not null, 'restaurado');
  perform pg_temp.logout();

  -- ── quem fez é quem está logado
  perform pg_temp.login('membro');
  update public.card set title = 'Login v2' where id = c;
  perform pg_temp.assert_that((pg_temp.last('card.renamed')).actor_id = auth.uid()
    and (pg_temp.last('card.renamed')).actor_name = 'membro', 'autor certo');
  perform pg_temp.assert_that(pg_temp.row_count(format('select * from public.activity where card_id = %s', c)) > 5,
    'membro lê o histórico do card');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.activity (team_id, actor_name, action) values (%s, %L, %L)', t, 'falso', 'card.created')),
    'ninguém escreve no histórico direto');
  perform pg_temp.assert_that(pg_temp.fails('delete from public.activity'), 'ninguém apaga o histórico');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'select public.log_activity(%s, null, null, %L)', t, 'falso')), 'log_activity não é chamável pelo app');
  perform pg_temp.logout();

  perform pg_temp.login('estranho');
  perform pg_temp.assert_that(pg_temp.row_count(format('select * from public.activity where team_id = %s', t)) = 0,
    'estranho não vê o histórico');
  perform pg_temp.logout();

  -- ── equipe
  perform pg_temp.login('admin');
  update public.team_member set role = 'viewer' where team_id = t and user_id = pg_temp.uid('membro');
  a := pg_temp.last('member.role_changed');
  perform pg_temp.assert_that(a.payload ->> 'from' = 'member' and a.payload ->> 'to' = 'viewer', 'papel mudado');
  update public.team_member set job_title = 'Designer' where team_id = t and user_id = pg_temp.uid('membro');
  perform pg_temp.assert_that((pg_temp.last('member.job_title_changed')).payload ->> 'to' = 'Designer', 'cargo');
  update public.team set name = 'Equipe Nova' where id = t;
  perform pg_temp.assert_that((pg_temp.last('team.renamed')).payload ->> 'from' = 'Equipe Teste', 'equipe renomeada');
  insert into public.team_invite (team_id, label, role) values (t, 'Carla', 'member');
  perform pg_temp.assert_that((pg_temp.last('invite.created')).payload ->> 'label' = 'Carla', 'convite gerado');
  update public.team_invite set revoked_at = now() where team_id = t;
  perform pg_temp.assert_that((pg_temp.last('invite.revoked')).id is not null, 'convite cancelado');
  delete from public.team_member where team_id = t and user_id = pg_temp.uid('membro');
  perform pg_temp.assert_that((pg_temp.last('member.removed')).payload ->> 'name' = 'membro', 'membro removido');

  -- ── apagar: card some, histórico fica
  delete from public.card where id = c;
  perform pg_temp.assert_that((pg_temp.last('card.deleted')).payload ->> 'title' = 'Login v2', 'card apagado registrado');
  perform pg_temp.assert_that(not exists (select 1 from public.activity where card_id = c), 'entradas antigas perdem o card_id');
  perform pg_temp.assert_that(exists (select 1 from public.activity where action = 'card.renamed' and team_id = t),
    'mas continuam no histórico da equipe');

  -- ── apagar a equipe com histórico não trava e leva o histórico junto
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.team where id = %s', t)) = 1, 'apaga a equipe');
  perform pg_temp.logout();
  perform pg_temp.assert_that(not exists (select 1 from public.activity where team_id = t), 'histórico vai junto');

  raise exception 'PASSOU: todos os testes da 0009 passaram (e nada ficou gravado)';
end;
$$;
