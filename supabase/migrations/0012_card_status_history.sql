-- Histórico de status dos cards: a base das métricas reais do dashboard (entregas, lead time,
-- backlog, paradas). Cada linha diz "a partir deste momento o card estava neste status".
--
-- Só o banco escreve aqui, por triggers, nunca o app:
--   - card criado: o status da coluna em que nasceu;
--   - card trocou de coluna ou foi desarquivado: o status da coluna, se mudou;
--   - coluna trocou de tipo: o novo status para cada card (não arquivado) que está nela.
-- Renomear coluna não muda nada (o activity guarda nomes; aqui vale o tipo). Arquivar também
-- não: quem lê decide o que fazer com card.archived_at. Apagar o card apaga o histórico dele.

create table public.card_status_history (
  id bigint generated always as identity primary key,
  card_id bigint not null references public.card (id) on delete cascade,
  board_id bigint not null references public.board (id) on delete cascade,
  status text not null check (status in ('todo', 'doing', 'done')),
  changed_at timestamptz not null default now()
);

create index card_status_history_board_changed on public.card_status_history (board_id, changed_at);
create index card_status_history_card on public.card_status_history (card_id, changed_at);

alter table public.card_status_history enable row level security;

-- Leitura para quem vê o board; nenhuma política de escrita (os triggers são security definer).
create policy "card_status_history_select" on public.card_status_history
  for select to authenticated using (public.board_role(board_id) is not null);

revoke insert, update, delete, truncate on public.card_status_history from anon, authenticated;

-- Cards que já existem: só o que se sabe com certeza, o status atual desde que entraram na coluna.
-- O caminho anterior não é inventado.
insert into public.card_status_history (card_id, board_id, status, changed_at)
select c.id, c.board_id, l.status, c.list_entered_at
from public.card c
join public.list l on l.id = c.list_id;

-- Compara com o último status gravado (e não com a coluna anterior): assim um card desarquivado
-- numa coluna que mudou de tipo enquanto ele estava arquivado também fica certo.
create function public.card_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select l.status into v_status from public.list l where l.id = new.list_id;
  if v_status is distinct from (
    select h.status from public.card_status_history h where h.card_id = new.id order by h.id desc limit 1
  ) then
    insert into public.card_status_history (card_id, board_id, status) values (new.id, new.board_id, v_status);
  end if;
  return null;
end;
$$;

create trigger card_log_status
  after insert or update of list_id, archived_at on public.card
  for each row execute function public.card_log_status();

create function public.list_log_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.card_status_history (card_id, board_id, status)
    select c.id, c.board_id, new.status
    from public.card c
    where c.list_id = new.id and c.archived_at is null;
  end if;
  return null;
end;
$$;

create trigger list_log_status
  after update of status on public.list
  for each row execute function public.list_log_status();

revoke execute on function public.card_log_status(), public.list_log_status() from public, anon, authenticated;
