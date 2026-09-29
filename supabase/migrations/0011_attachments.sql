-- Anexos dos cards. O arquivo fica no Storage (bucket privado "attachments"); o banco guarda só
-- os metadados. Caminho no bucket: "<card_id>/<uuid>" (o nome original é só metadado).
--
-- Fluxo de envio (a Edge Function "attachments" é a única que grava aqui):
--   1. O app envia o arquivo direto ao Storage. A policy só deixa quem edita o card, e o bucket
--      recusa acima de 20 MB e tipos fora da lista (pelo Content-Type declarado).
--   2. A Edge Function confere o conteúdo real (assinatura dos bytes), grava a linha abaixo e,
--      se o arquivo não passar, apaga do Storage. Enquanto não há linha, ninguém lê o arquivo.
-- Exclusão: o banco não apaga arquivos do Storage. Apagar um anexo (sozinho ou em cascata do
-- card, da coluna, do board ou da equipe) põe o caminho na attachment_trash, e a Edge Function
-- esvazia a lixeira (o app chama depois de excluir). Arquivar o card não mexe nos anexos.

create table public.card_attachment (
  id bigint generated always as identity primary key,
  card_id bigint not null references public.card (id) on delete cascade,
  -- Desnormalizado (como em card) para contar anexos do board e para o filtro do Realtime.
  board_id bigint not null references public.board (id) on delete cascade,
  name text not null check (length(name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  storage_path text not null unique,
  uploaded_by uuid references public.profile (id) on delete set null,
  -- Nome da época, como no histórico: quem sai da equipe some de profile para os outros.
  uploaded_by_name text not null,
  created_at timestamptz not null default now(),
  -- Imagem usada como capa do card no board (no máximo uma por card).
  is_cover boolean not null default false,
  check (not is_cover or mime_type like 'image/%')
);

create index idx_card_attachment_card on public.card_attachment (card_id, created_at);
create index idx_card_attachment_board on public.card_attachment (board_id);
create unique index idx_card_attachment_one_cover on public.card_attachment (card_id) where is_cover;

create function public.set_attachment_board_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.board_id := (select c.board_id from public.card c where c.id = new.card_id);
  return new;
end;
$$;

create trigger card_attachment_set_board_id
  before insert on public.card_attachment
  for each row execute function public.set_attachment_board_id();

-- Se o card for para uma coluna de outro board, os anexos acompanham.
create function public.sync_attachment_board_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.board_id is distinct from old.board_id then
    update public.card_attachment set board_id = new.board_id where card_id = new.id;
  end if;
  return new;
end;
$$;

create trigger card_sync_attachment_board_id
  after update of board_id on public.card
  for each row execute function public.sync_attachment_board_id();

-- ─── Lixeira do Storage ──────────────────────────────────────────────────────

create table public.attachment_trash (
  storage_path text primary key,
  deleted_at timestamptz not null default now()
);

create function public.trash_attachment_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.attachment_trash (storage_path) values (old.storage_path) on conflict do nothing;
  return old;
end;
$$;

create trigger card_attachment_trash_file
  after delete on public.card_attachment
  for each row execute function public.trash_attachment_file();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.card_attachment enable row level security;
alter table public.attachment_trash enable row level security;

create policy "card_attachment_select" on public.card_attachment
  for select to authenticated using (public.card_role(card_id) is not null);
create policy "card_attachment_delete" on public.card_attachment
  for delete to authenticated using (public.card_role(card_id) in ('admin', 'member'));
-- Inserir: só a Edge Function (service_role), depois de conferir o conteúdo. Alterar: só a capa,
-- pela função abaixo.
revoke all on public.card_attachment from anon;
revoke insert, update on public.card_attachment from authenticated;
-- A lixeira é só da Edge Function.
revoke all on public.attachment_trash from anon, authenticated;

-- Capa: liga numa imagem do card e desliga nas outras; null tira a capa.
create function public.set_card_cover(p_card_id bigint, p_attachment_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.card_role(p_card_id)::text, '') not in ('admin', 'member') then
    raise exception 'Sem permissão para editar este card';
  end if;
  if p_attachment_id is not null and not exists (
    select 1 from public.card_attachment a
    where a.id = p_attachment_id and a.card_id = p_card_id and a.mime_type like 'image/%'
  ) then
    raise exception 'A capa precisa ser uma imagem anexada a este card';
  end if;
  update public.card_attachment set is_cover = false where card_id = p_card_id and is_cover;
  if p_attachment_id is not null then
    update public.card_attachment set is_cover = true where id = p_attachment_id;
  end if;
end;
$$;

revoke execute on function public.set_card_cover(bigint, bigint) from public, anon;
grant execute on function public.set_card_cover(bigint, bigint) to authenticated;

-- ─── Storage ──────────────────────────────────────────────────────────────────

-- 20 MB = MAX_ATTACHMENT_MB (src/lib/attachmentRules.ts). Tipos = ALLOWED_MIME_TYPES.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 20971520,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/zip'
  ]
);

-- card_id de um caminho "<card_id>/<uuid>"; null se o caminho não tiver esse formato.
create function public.attachment_path_card_id(p_path text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_path ~ '^[0-9]{1,18}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_path, '/', 1)::bigint
  end;
$$;

create function public.can_upload_attachment(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.card_role(public.attachment_path_card_id(p_path)) in ('admin', 'member'), false);
$$;

-- Só lê (e gera URL assinada) quem enxerga o card, e só depois de a Edge Function aprovar.
create function public.can_read_attachment(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.card_attachment a
    where a.storage_path = p_path and public.card_role(a.card_id) is not null
  );
$$;

revoke execute on function public.attachment_path_card_id(text), public.can_upload_attachment(text),
  public.can_read_attachment(text) from public, anon;
grant execute on function public.attachment_path_card_id(text), public.can_upload_attachment(text),
  public.can_read_attachment(text) to authenticated;

-- Sem policy de update nem de delete: ninguém sobrescreve nem apaga pelo app; quem apaga é a
-- Edge Function, pela lixeira.
create policy "attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_upload_attachment(name));
create policy "attachments_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and public.can_read_attachment(name));

-- Arquivos enviados que a Edge Function nunca aprovou (o envio caiu no meio): ela apaga os mais
-- antigos que p_older_than ao esvaziar a lixeira.
create function public.attachment_orphans(p_older_than interval)
returns table (storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'attachments'
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.card_attachment a where a.storage_path = o.name)
    and not exists (select 1 from public.attachment_trash t where t.storage_path = o.name);
$$;

revoke execute on function public.attachment_orphans(interval) from public, anon, authenticated;
grant execute on function public.attachment_orphans(interval) to service_role;

-- ─── Realtime ─────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.card_attachment;
