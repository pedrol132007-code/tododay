-- Base das métricas por status e dos cards com contexto.
--   list.status: o tipo por trás da coluna (o nome continua livre). Colunas novas: 'todo'.
--   card.priority: prioridade opcional (null = sem prioridade).
--   card.list_entered_at: quando o card entrou na coluna atual ("parada há X dias").

alter table public.list
  add column status text not null default 'todo'
  check (status in ('todo', 'doing', 'done'));

-- Palpite inicial pelo nome das colunas que já existem; dá para trocar depois no menu da coluna.
update public.list set status = 'done'
where name ~* '(conclu|finaliz|feito|entregue|done|pronto)';
update public.list set status = 'doing'
where status = 'todo' and name ~* '(andamento|fazendo|progresso|execu|doing|revis|valida|teste)';

alter table public.card
  add column priority text check (priority in ('low', 'medium', 'high', 'urgent')),
  add column list_entered_at timestamptz not null default now();

-- Cards que já existem: último "card movido" do histórico de atividade; sem ele, a criação.
update public.card c set list_entered_at = coalesce(
  (select max(a.created_at) from public.activity a where a.card_id = c.id and a.action = 'card.moved'),
  c.created_at);

-- Relógio do servidor: muda só quando o card troca de coluna, e ninguém ajusta à mão.
create function public.touch_card_list_entered_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.list_entered_at := now();
  elsif new.list_id is distinct from old.list_id then
    new.list_entered_at := now();
  else
    new.list_entered_at := old.list_entered_at;
  end if;
  return new;
end;
$$;

create trigger card_touch_list_entered_at
  before insert or update on public.card
  for each row execute function public.touch_card_list_entered_at();
