-- E7: o app assina mudanças destas tabelas (Supabase Realtime, "postgres_changes") para
-- atualizar a tela quando outra pessoa mexe no board. A RLS continua valendo: cada um só
-- recebe eventos de linhas que pode ler. Exceção do próprio Realtime: eventos de DELETE não
-- passam por filtro nem RLS, mas só carregam a chave primária (o id), nunca o conteúdo.

alter publication supabase_realtime add table
  public.board, public.list, public.card, public.label, public.card_label, public.checklist_item;
