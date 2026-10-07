-- Teste da 0016 (coroa de líder e foto de perfil). Um bloco DO que termina SEMPRE com erro.
--   Passou: erro "PASSOU: todos os testes da 0016 passaram".
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
  t bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'membro', 'leitor']) n;

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values
    (t, pg_temp.uid('membro'), 'member'), (t, pg_temp.uid('leitor'), 'viewer');

  -- ── Coroa ──
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.team_member set is_leader = true where team_id = %s and user_id = %L', t, pg_temp.uid('membro'))) = 0,
    'membro não se coroa');
  perform pg_temp.logout();

  perform pg_temp.login('admin');
  update public.team_member set is_leader = true where team_id = t and user_id = pg_temp.uid('membro');
  perform pg_temp.assert_that((select is_leader from public.team_member where team_id = t and user_id = pg_temp.uid('membro')),
    'admin dá a coroa');
  perform pg_temp.assert_that(exists (select 1 from public.activity where team_id = t and action = 'member.leader_on'
    and payload->>'name' = 'membro'), 'coroa vai para a atividade');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.team_member set is_leader = true where team_id = %s and user_id = %L', t, pg_temp.uid('leitor'))),
    'leitor não é líder');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.team_member set role = %L where team_id = %s and user_id = %L', 'viewer', t, pg_temp.uid('membro'))),
    'líder não vira leitor sem tirar a coroa');
  update public.team_member set role = 'viewer', is_leader = false where team_id = t and user_id = pg_temp.uid('membro');
  perform pg_temp.assert_that(exists (select 1 from public.activity where team_id = t and action = 'member.leader_off'),
    'tirar a coroa vai para a atividade');
  perform pg_temp.logout();

  -- ── Foto ──
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(public.avatar_path_is_mine(pg_temp.uid('membro')::text || '/a.webp'), 'pasta própria é minha');
  perform pg_temp.assert_that(not public.avatar_path_is_mine(pg_temp.uid('admin')::text || '/a.webp'), 'pasta alheia não é minha');
  perform pg_temp.assert_that(not public.avatar_path_is_mine('a.webp'), 'sem pasta não é minha');
  update public.profile set avatar_path = pg_temp.uid('membro')::text || '/a.webp' where id = pg_temp.uid('membro');
  perform pg_temp.assert_that((select avatar_path from public.profile where id = pg_temp.uid('membro')) is not null,
    'cada um grava a própria foto');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.profile set avatar_path = %L where id = %L', pg_temp.uid('admin')::text || '/a.webp', pg_temp.uid('membro'))),
    'foto precisa estar na própria pasta');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.profile set avatar_path = null where id = %L', pg_temp.uid('admin'))) = 0,
    'ninguém muda a foto dos outros');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.profile set email = %L where id = %L', 'x@x.com', pg_temp.uid('membro'))),
    'email continua fora do alcance do cliente');
  perform pg_temp.logout();

  perform pg_temp.assert_that((select public from storage.buckets where id = 'avatars'), 'bucket avatars é público');

  raise exception 'PASSOU: todos os testes da 0016 passaram';
end;
$$;
