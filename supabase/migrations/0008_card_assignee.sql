-- E8: responsável pelo card. Precisa ser membro da equipe dona do board; quem sai
-- (ou é removido) da equipe deixa de ser responsável pelos cards dela.

alter table public.card
  add column assignee_id uuid references public.profile (id) on delete set null;

create index idx_card_assignee on public.card (assignee_id);

-- Nome começa com "v" de propósito: triggers do mesmo evento rodam em ordem alfabética,
-- e este precisa rodar depois de card_set_board_id (que preenche board_id no insert).
create function public.validate_card_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null and not exists (
    select 1 from public.board b
    join public.team_member m on m.team_id = b.team_id
    where b.id = new.board_id and m.user_id = new.assignee_id
  ) then
    raise exception 'O responsável precisa ser membro da equipe';
  end if;
  return new;
end;
$$;

create trigger card_validate_assignee
  before insert or update of assignee_id, list_id on public.card
  for each row execute function public.validate_card_assignee();

create function public.unassign_removed_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Apagar a equipe apaga os cards em cascata, e apagar a conta já desatribui pela FK
  -- (on delete set null): nos dois casos não há o que fazer, e mexer nos cards no meio da
  -- cascata daria conflito.
  if not exists (select 1 from public.team t where t.id = old.team_id)
     or not exists (select 1 from public.profile p where p.id = old.user_id) then
    return old;
  end if;
  update public.card c set assignee_id = null
  from public.board b
  where b.id = c.board_id and b.team_id = old.team_id and c.assignee_id = old.user_id;
  return old;
end;
$$;

create trigger team_member_unassign_cards
  after delete on public.team_member
  for each row execute function public.unassign_removed_member();
