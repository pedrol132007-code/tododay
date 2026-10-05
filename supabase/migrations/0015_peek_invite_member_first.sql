-- peek_invite passa a dizer "já é membro" antes de "usado/expirado/cancelado", na mesma ordem do
-- accept_invite (que, para quem já é membro, devolve a equipe sem olhar o resto). Antes, quem abria
-- de novo o link que acabou de usar via "esse convite já foi usado" em vez de "você já está na equipe".

create or replace function public.peek_invite(p_token uuid)
returns table (team_name text, role public.member_role, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.name, i.role,
    case
      when exists (select 1 from public.team_member m where m.team_id = i.team_id and m.user_id = auth.uid())
        then 'already_member'
      when i.revoked_at is not null then 'revoked'
      when i.used_at is not null then 'used'
      when i.expires_at < now() then 'expired'
      else 'valid'
    end
  from public.team_invite i
  join public.team t on t.id = i.team_id
  where i.token = p_token and auth.uid() is not null;
$$;
