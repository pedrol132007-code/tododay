-- Coroa de líder e foto de perfil (docs/superpowers/specs/2026-10-07-lider-e-notificacoes-design.md).
--
-- 1. team_member.is_leader: um selo, não um papel. Permissão continua sendo só o role. Só o admin
--    muda (policy team_member_update, 0003). Leitor não é líder.
-- 2. profile.avatar_path: foto no bucket público "avatars", em "<user_id>/<uuid>.<ext>". Cada um
--    grava e apaga só na própria pasta. Público porque é uma foto de perfil vista pela equipe toda
--    e o nome do arquivo é um uuid novo a cada troca (ninguém adivinha).

-- ─── Líder ────────────────────────────────────────────────────────────────────

alter table public.team_member add column is_leader boolean not null default false;
alter table public.team_member add constraint team_member_viewer_not_leader
  check (not (is_leader and role = 'viewer'));

grant update (is_leader) on public.team_member to authenticated;

create or replace function public.team_member_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.team_member := coalesce(new, old);
  v_name text := public.display_name_of(v_member.user_id);
begin
  -- Conta sendo apagada: é cascata.
  if v_name is null then
    return v_member;
  end if;
  if tg_op = 'INSERT' then
    perform public.log_activity(new.team_id, null, null, 'member.joined',
      jsonb_build_object('name', v_name, 'role', new.role));
  elsif tg_op = 'DELETE' then
    perform public.log_activity(old.team_id, null, null,
      case when old.user_id = auth.uid() then 'member.left' else 'member.removed' end,
      jsonb_build_object('name', v_name));
  else
    if new.role is distinct from old.role then
      perform public.log_activity(new.team_id, null, null, 'member.role_changed',
        jsonb_build_object('name', v_name, 'from', old.role, 'to', new.role));
    end if;
    if new.job_title is distinct from old.job_title then
      perform public.log_activity(new.team_id, null, null, 'member.job_title_changed',
        jsonb_build_object('name', v_name, 'to', new.job_title));
    end if;
    if (new.deactivated_at is null) is distinct from (old.deactivated_at is null) then
      perform public.log_activity(new.team_id, null, null,
        case when new.deactivated_at is null then 'member.reactivated' else 'member.deactivated' end,
        jsonb_build_object('name', v_name));
    end if;
    if new.is_leader is distinct from old.is_leader then
      perform public.log_activity(new.team_id, null, null,
        case when new.is_leader then 'member.leader_on' else 'member.leader_off' end,
        jsonb_build_object('name', v_name));
    end if;
  end if;
  return v_member;
end;
$$;

drop trigger team_member_log_activity on public.team_member;
create trigger team_member_log_activity
  after insert or delete or update of role, job_title, deactivated_at, is_leader on public.team_member
  for each row execute function public.team_member_activity();

-- ─── Foto de perfil ───────────────────────────────────────────────────────────

alter table public.profile add column avatar_path text;
alter table public.profile add constraint profile_avatar_own_folder
  check (avatar_path is null or avatar_path like id::text || '/%');

grant update (display_name, avatar_path) on public.profile to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- "<user_id>/..." é da pessoa logada.
create function public.avatar_path_is_mine(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((storage.foldername(p_name))[1] = auth.uid()::text, false);
$$;

revoke execute on function public.avatar_path_is_mine(text) from public, anon;
grant execute on function public.avatar_path_is_mine(text) to authenticated;

-- Leitura é pública (bucket público); o select abaixo é o que a API de Storage exige para apagar.
create policy "avatars_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.avatar_path_is_mine(name));
create policy "avatars_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.avatar_path_is_mine(name));
create policy "avatars_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.avatar_path_is_mine(name));
