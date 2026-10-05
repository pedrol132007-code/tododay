-- Auditoria de segurança do banco. Só LÊ (não muda nada): cole no SQL Editor do projeto e rode.
-- Cada linha do resultado é um problema. Resultado vazio ("No rows returned") = tudo certo.
-- Rode depois de cada migration nova, no dev e no prod.

with
-- 1. Tabela do app sem RLS: qualquer um com a chave pública leria tudo.
sem_rls as (
  select 'Tabela sem RLS: public.' || c.relname as problema
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),
-- 2. Quem não está logado (anon) com qualquer permissão numa tabela do app.
anon_tabela as (
  select distinct 'anon tem ' || privilege_type || ' em public.' || table_name as problema
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
),
-- 3. Função security definer sem search_path fixo (dá para sequestrar com um objeto de mesmo nome).
definer_sem_path as (
  select 'Função security definer sem search_path: public.' || p.proname as problema
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
),
-- 4. Função do app que quem não está logado pode chamar (trigger não conta: não dá para chamar direto).
anon_funcao as (
  select 'anon pode executar public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as problema
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'execute')
),
-- 5. Bucket público: os arquivos abririam sem URL assinada.
bucket_publico as (
  select 'Bucket público no Storage: ' || id as problema from storage.buckets where public
),
-- 6. Tabela com RLS mas sem nenhuma policy de leitura (não é falha de segurança, mas o app não lê).
sem_leitura as (
  select 'Tabela com RLS e sem policy de SELECT (ninguém lê pelo app): public.' || c.relname as problema
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.cmd in ('SELECT', 'ALL'))
    and c.relname not in ('attachment_trash')
)
select problema from sem_rls
union all select problema from anon_tabela
union all select problema from definer_sem_path
union all select problema from anon_funcao
union all select problema from bucket_publico
union all select problema from sem_leitura
order by 1;
