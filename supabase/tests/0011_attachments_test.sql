-- Teste da 0011 (anexos: metadados, permissões, capa, lixeira e policies do Storage). Rode
-- inteiro no SQL Editor depois de aplicar a migration. Um bloco DO que termina SEMPRE com erro,
-- para desfazer tudo.
--   Passou: erro "PASSOU: todos os testes da 0011 passaram".
--   Falhou: erro começando com "FALHOU:" (ou qualquer outro erro).
--
-- A conferência do conteúdo dos arquivos fica na Edge Function e é testada em
-- src/lib/attachmentRules.test.ts (npm test).

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
  t bigint; t2 bigint; b bigint; b2 bigint; l bigint; l2 bigint; c bigint; c2 bigint; c_outro bigint;
  a1 bigint; a2 bigint; a3 bigint;
  p1 text; p2 text; p3 text;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'membro', 'leitor', 'estranho']) n;

  perform pg_temp.login('estranho');
  t2 := public.create_team('Equipe do Estranho');
  insert into public.board (team_id, name, position) values (t2, 'Board do estranho', 1) returning id into b2;
  insert into public.list (board_id, name, position) values (b2, 'Coluna', 1) returning id into l2;
  insert into public.card (list_id, title, position) values (l2, 'Card do estranho', 1) returning id into c_outro;
  perform pg_temp.logout();

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  insert into public.board (team_id, name, position) values (t, 'Board', 1) returning id into b;
  insert into public.list (board_id, name, position) values (b, 'Coluna', 1) returning id into l;
  insert into public.card (list_id, title, position) values (l, 'Card', 1) returning id into c;
  insert into public.card (list_id, title, position) values (l, 'Card 2', 2) returning id into c2;
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role)
  values (t, pg_temp.uid('membro'), 'member'), (t, pg_temp.uid('leitor'), 'viewer');
  -- Boards por pessoa (0020): todo mundo da equipe em todos os boards dela, como antes.
  insert into public.board_member (board_id, user_id)
    select bb.id, mm.user_id from public.board bb join public.team_member mm on mm.team_id = bb.team_id
    on conflict do nothing;

  -- Como a Edge Function (service_role): grava os metadados depois de aprovar o arquivo.
  p1 := c || '/' || gen_random_uuid();
  p2 := c || '/' || gen_random_uuid();
  p3 := c2 || '/' || gen_random_uuid();
  insert into public.card_attachment (card_id, name, mime_type, size_bytes, storage_path, uploaded_by, uploaded_by_name)
  values (c, 'foto.png', 'image/png', 1000, p1, pg_temp.uid('membro'), 'membro') returning id into a1;
  insert into public.card_attachment (card_id, name, mime_type, size_bytes, storage_path, uploaded_by, uploaded_by_name)
  values (c, 'contrato.pdf', 'application/pdf', 2000, p2, pg_temp.uid('membro'), 'membro') returning id into a2;
  insert into public.card_attachment (card_id, name, mime_type, size_bytes, storage_path, uploaded_by, uploaded_by_name)
  values (c2, 'outra.jpg', 'image/jpeg', 3000, p3, pg_temp.uid('admin'), 'admin') returning id into a3;
  perform pg_temp.assert_that((select board_id from public.card_attachment where id = a1) = b, 'board_id vem do card');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.card_attachment (card_id, name, mime_type, size_bytes, storage_path, uploaded_by_name, is_cover) values (%s, %L, %L, 1, %L, %L, true)',
    c, 'x.pdf', 'application/pdf', c || '/' || gen_random_uuid(), 'x')), 'capa que não é imagem é recusada pelo banco');

  -- ── caminho no bucket
  perform pg_temp.assert_that(public.attachment_path_card_id(p1) = c, 'lê o card do caminho');
  perform pg_temp.assert_that(public.attachment_path_card_id('abc/' || gen_random_uuid()) is null
    and public.attachment_path_card_id(c || '/../' || gen_random_uuid()) is null
    and public.attachment_path_card_id(c || '/nome.pdf') is null
    and public.attachment_path_card_id(c || '/' || gen_random_uuid() || '/x') is null, 'caminho fora do formato não vale');

  -- ── leitor: vê e baixa, não envia nem apaga
  perform pg_temp.login('leitor');
  perform pg_temp.assert_that((select count(*) from public.card_attachment where board_id = b) = 3, 'leitor vê os anexos do board');
  perform pg_temp.assert_that(public.can_read_attachment(p1), 'leitor pode baixar');
  perform pg_temp.assert_that(not public.can_upload_attachment(c || '/' || gen_random_uuid()), 'leitor não envia');
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.card_attachment where id = %s', a1)) = 0, 'leitor não apaga');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.card_attachment (card_id, name, mime_type, size_bytes, storage_path, uploaded_by_name) values (%s, %L, %L, 1, %L, %L)',
    c, 'x.png', 'image/png', c || '/' || gen_random_uuid(), 'x')), 'ninguém do app grava metadados direto');
  perform pg_temp.assert_that(pg_temp.fails(format('select public.set_card_cover(%s, %s)', c, a1)), 'leitor não troca a capa');
  perform pg_temp.logout();

  -- ── estranho: não vê nada da outra equipe
  perform pg_temp.login('estranho');
  perform pg_temp.assert_that((select count(*) from public.card_attachment) = 0, 'estranho não vê anexos de outra equipe');
  perform pg_temp.assert_that(not public.can_read_attachment(p1), 'estranho não baixa');
  perform pg_temp.assert_that(not public.can_upload_attachment(c || '/' || gen_random_uuid()), 'estranho não envia para card alheio');
  perform pg_temp.assert_that(public.can_upload_attachment(c_outro || '/' || gen_random_uuid()), 'mas envia para o próprio card');
  perform pg_temp.assert_that(not public.can_read_attachment(c_outro || '/' || gen_random_uuid()),
    'arquivo sem metadados (ainda não aprovado) ninguém lê');
  perform pg_temp.logout();

  -- ── membro: envia, troca a capa e apaga
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(public.can_upload_attachment(c || '/' || gen_random_uuid()), 'membro envia');
  perform pg_temp.assert_that(not public.can_upload_attachment(c || '/nome-escolhido.pdf'), 'nome no storage é sempre uuid');
  perform public.set_card_cover(c, a1);
  perform pg_temp.assert_that((select is_cover from public.card_attachment where id = a1), 'imagem vira capa');
  perform pg_temp.assert_that(pg_temp.fails(format('select public.set_card_cover(%s, %s)', c, a2)), 'pdf não vira capa');
  perform pg_temp.assert_that(pg_temp.fails(format('select public.set_card_cover(%s, %s)', c, a3)), 'imagem de outro card não vira capa');
  perform pg_temp.assert_that(pg_temp.fails(format('update public.card_attachment set is_cover = false where id = %s', a1)),
    'capa só muda pela função');
  perform public.set_card_cover(c, null);
  perform pg_temp.assert_that(not (select is_cover from public.card_attachment where id = a1), 'tira a capa');
  perform public.set_card_cover(c, a1);
  perform pg_temp.assert_that(pg_temp.fails('select * from public.attachment_trash'), 'a lixeira não é acessível pelo app');
  perform pg_temp.assert_that(pg_temp.fails('select * from public.attachment_orphans(interval ''1 day'')'), 'órfãos só pela Edge Function');

  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.card_attachment where id = %s', a2)) = 1, 'membro apaga um anexo');
  -- Arquivar não mexe nos anexos.
  update public.card set archived_at = now() where id = c;
  perform pg_temp.assert_that((select count(*) from public.card_attachment where card_id = c) = 1, 'arquivar o card guarda os anexos');
  -- Excluir de vez apaga em cascata.
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.card where id = %s', c)) = 1, 'membro exclui o card');
  perform pg_temp.logout();

  perform pg_temp.assert_that((select count(*) from public.card_attachment where card_id = c) = 0, 'excluir o card apaga os anexos');
  perform pg_temp.assert_that(exists (select 1 from public.attachment_trash where storage_path = p2), 'anexo apagado vai para a lixeira');
  perform pg_temp.assert_that(exists (select 1 from public.attachment_trash where storage_path = p1),
    'anexo do card excluído vai para a lixeira');

  -- Excluir o board também.
  perform pg_temp.login('admin');
  perform pg_temp.assert_that(pg_temp.affected(format('delete from public.board where id = %s', b)) = 1, 'admin exclui o board');
  perform pg_temp.logout();
  perform pg_temp.assert_that(exists (select 1 from public.attachment_trash where storage_path = p3),
    'excluir o board põe os arquivos na lixeira');

  raise exception 'PASSOU: todos os testes da 0011 passaram (e nada ficou gravado)';
end;
$$;
