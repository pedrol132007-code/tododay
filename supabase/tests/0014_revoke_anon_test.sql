-- Teste da 0014 (nada para anon no schema public). Rode inteiro no SQL Editor depois de aplicar a
-- migration. Um bloco DO que termina SEMPRE com erro, para desfazer tudo.
--   Passou: erro "PASSOU: todos os testes da 0014 passaram".
--   Falhou: erro começando com "FALHOU:" (ou qualquer outro erro).

do $$
declare
  v_problem text;
begin
  select 'anon tem ' || privilege_type || ' em public.' || table_name into v_problem
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
  limit 1;
  if v_problem is not null then
    raise exception 'FALHOU: %', v_problem;
  end if;

  select 'anon executa public.' || p.proname into v_problem
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    -- Função de trigger não dá para chamar direto (mesma regra da auditoria).
    and p.prorettype <> 'trigger'::regtype
  limit 1;
  if v_problem is not null then
    raise exception 'FALHOU: %', v_problem;
  end if;

  -- Tabela nova também nasce fechada para anon (default privileges).
  create table public.tmp_teste_0014 (id int);
  if has_table_privilege('anon', 'public.tmp_teste_0014', 'select') then
    raise exception 'FALHOU: tabela nova nasce com select para anon';
  end if;

  -- Quem está logado continua com o que tinha.
  if not has_table_privilege('authenticated', 'public.card', 'select') then
    raise exception 'FALHOU: authenticated perdeu o select em card';
  end if;
  if not has_function_privilege('authenticated', 'public.create_team(text)', 'execute') then
    raise exception 'FALHOU: authenticated perdeu o create_team';
  end if;

  raise exception 'PASSOU: todos os testes da 0014 passaram (e nada ficou gravado)';
end;
$$;
