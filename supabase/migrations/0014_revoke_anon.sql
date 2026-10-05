-- Quem não está logado (papel anon) não tem nada a fazer no schema public: o app inteiro exige
-- login. A RLS já barrava tudo (as policies são "to authenticated"), mas algumas tabelas ainda tinham
-- o grant padrão para anon (profile, card_status_history). Aqui o grant sai de tudo, de uma vez, e
-- também das tabelas e funções que vierem depois. Conferido por supabase/tests/auditoria_seguranca.sql.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
