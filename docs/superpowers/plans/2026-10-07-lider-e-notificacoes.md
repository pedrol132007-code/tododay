# Líder, foto de perfil e notificações — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coroa de líder por equipe, foto de perfil e uma aba Notificações (atribuição, avisos de prazo 3 dias/1 dia/atraso, mudanças agrupadas), tudo também na demonstração do dev.

**Architecture:** Duas migrations (`0016` líder + foto, `0017` notificações). O banco gera as notificações sozinho (triggers em `card` e `card_attachment`, `pg_cron` diário); o cliente só lê, marca como lida e recebe pelo Realtime. A UI trabalha com um modelo único `NotificationItem` (`src/lib/notifications.ts`), montado a partir do banco ou da demonstração, e a mesma `NotificationsView` mostra os dois.

**Tech Stack:** Postgres/Supabase (RLS, triggers, Storage, Realtime, pg_cron), React 18 + TS + React Query, Tailwind com tokens, Vitest, Playwright (mock).

**Spec:** `docs/superpowers/specs/2026-10-07-lider-e-notificacoes-design.md`

## Global Constraints

- Branch `lider-e-notificacoes`. Nunca editar migration aplicada; `0016_leader_and_avatar.sql` e `0017_notifications.sql` são novas.
- Toda migration vem com `supabase/tests/NNNN_*_test.sql` (bloco `DO` que sempre termina em erro `PASSOU: ...`/`FALHOU: ...`) e com `npm run gen:setup` regerado no mesmo commit; tipos em `src/types/index.ts` no mesmo commit.
- Todo acesso ao Supabase em `src/db/*.ts`. Componentes só usam hooks.
- Cores só pelos tokens (`primary`, `danger`, `highlight`, `on-accent`, `bg-*`, `text-*`, `border`). Nada de hex ou cor do Tailwind em componente. Coroa = `text-highlight`. Contador = `bg-danger text-on-accent`, número sempre escrito, "9+" acima de 9.
- Funções `security definer` com `set search_path = ''` e `revoke execute ... from public, anon` (a auditoria `supabase/tests/auditoria_seguranca.sql` reprova o contrário).
- Textos da UI em português, no tom do app.
- Kinds de notificação: exatamente `assigned`, `due_3d`, `due_1d`, `overdue`, `changed`.
- "Hoje" no banco: `(now() at time zone 'America/Sao_Paulo')::date`. Job: `0 11 * * *` (8h de Brasília).
- `overdue` só sai para prazos vencidos há 1 a 3 dias (`v_days between -3 and -1`): sai no dia seguinte ao prazo e tolera o job ter falhado um ou dois dias, sem despejar avisos de cards vencidos há meses no primeiro dia.
- Demonstração só fora de produção, nada vai para o banco ou o Storage.

## Review Focus

1. **Arquivo de foto estranho** (HEIC, GIF, 30 MB, imagem corrompida): mensagem clara e nada muda no perfil. Teste de `avatarFileError` na Tarefa 4.
2. **Card apagado ou pessoa que saiu da equipe**: a notificação continua na lista, sem link, com o nome da época e as iniciais. Teste de `toNotificationItem` na Tarefa 6.
3. **Mesmo card mudado muitas vezes** (descrição editada 10 vezes, 3 anexos): uma única notificação não lida, que acumula. Teste SQL na Tarefa 2 e índice único parcial.
4. **Mais de 9 não lidas**: o sino mostra "9+", não estoura o layout. Teste de `bellLabel` na Tarefa 6.
5. **Prazo mudado depois do aviso**: avisos voltam a valer para a data nova, sem repetir para a antiga. Teste SQL na Tarefa 2.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0016_leader_and_avatar.sql` | `team_member.is_leader`, `profile.avatar_path`, bucket `avatars`, atividade da coroa |
| `supabase/migrations/0017_notifications.sql` | tabela `notification`, RLS, triggers, avisos de prazo, pg_cron, Realtime |
| `supabase/tests/0016_leader_and_avatar_test.sql`, `0017_notifications_test.sql` | testes SQL |
| `supabase/tests/auditoria_seguranca.sql` | aceitar o bucket público `avatars` |
| `src/types/index.ts` | `TeamMember.is_leader`, `Profile.avatar_path`, `AppNotification`, `NotificationPayload`, `DashboardPerson.avatarUrl/isLeader` |
| `src/components/ui/icons.tsx` | `IconCrown`, `IconBell` |
| `src/components/ui/Avatar.tsx` | foto, coroa, tamanho grande |
| `src/db/avatars.ts` | URL pública, enviar e remover foto |
| `src/lib/avatarImage.ts` | validar arquivo, recortar e reduzir |
| `src/db/teams.ts`, `src/db/auth.ts` | trazer `avatar_url` e `is_leader` |
| `src/hooks/useAuth.ts` | `useSetAvatar`, `useRemoveAvatar` |
| `src/components/settings/ProfileSection.tsx` | Trocar/Remover foto |
| `src/components/team/TeamView.tsx` | avatar por pessoa e botão da coroa |
| `src/lib/activity.ts` | frases `member.leader_on/off` |
| `src/lib/notifications.ts` | modelo `NotificationItem`, frase, filtros, miniaturas, rótulo do sino |
| `src/db/notifications.ts`, `src/hooks/useNotifications.ts` | ler, marcar, montar itens |
| `src/db/realtime.ts`, `src/hooks/useRealtimeSync.ts` | canal da pessoa |
| `src/components/notifications/NotificationsView.tsx`, `NotificationBell.tsx` | UI |
| `src/components/ui/AppMenu.tsx`, `src/App.tsx` | view `notifications`, sino |
| `src/lib/demoAvatars.ts`, `src/lib/demoNotifications.ts`, `src/hooks/useDemoFiles.ts` | demonstração |
| `e2e/layout.spec.ts` | e2e simulado da aba |
| `CLAUDE.md` | documentar |

---

### Task 1: Migration 0016 — líder e foto (banco)

**Files:**
- Create: `supabase/migrations/0016_leader_and_avatar.sql`
- Create: `supabase/tests/0016_leader_and_avatar_test.sql`
- Modify: `supabase/tests/auditoria_seguranca.sql` (CTE `bucket_publico`)
- Modify: `src/types/index.ts` (`TeamMember`, `Profile`)
- Regenerate: `supabase/setup_producao.sql`

**Interfaces:**
- Produces: coluna `team_member.is_leader boolean`, `profile.avatar_path text | null`, bucket `avatars`, função `public.avatar_path_is_mine(text) returns boolean`, ações de atividade `member.leader_on` / `member.leader_off` com payload `{ name }`. TS: `TeamMember.is_leader: boolean`, `Profile.avatar_path: string | null`.

- [ ] **Step 1: Escrever o teste SQL (falha: a migration não existe)**

Copie o preâmbulo do teste da 0013 (tudo antes de `do $$`) e acrescente o bloco:

```bash
sed -n '/^delete from auth.users/,/^do \$\$/p' supabase/tests/0013_admin_lists_and_deactivation_test.sql | sed '$d' > supabase/tests/0016_leader_and_avatar_test.sql
```

Depois troque o cabeçalho do arquivo pelas linhas abaixo e acrescente o bloco `DO` no fim:

```sql
-- Teste da 0016 (coroa de líder e foto de perfil). Um bloco DO que termina SEMPRE com erro.
--   Passou: erro "PASSOU: todos os testes da 0016 passaram".
--   Falhou: erro começando com "FALHOU:" (ou qualquer outro erro).
```

```sql
do $$
declare
  t bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'membro', 'leitor']) n;

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values
    (t, pg_temp.uid('membro'), 'member'), (t, pg_temp.uid('leitor'), 'viewer');

  -- ── Coroa ──
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.team_member set is_leader = true where team_id = %s and user_id = %L', t, pg_temp.uid('membro'))) = 0,
    'membro não se coroa');
  perform pg_temp.logout();

  perform pg_temp.login('admin');
  update public.team_member set is_leader = true where team_id = t and user_id = pg_temp.uid('membro');
  perform pg_temp.assert_that((select is_leader from public.team_member where team_id = t and user_id = pg_temp.uid('membro')),
    'admin dá a coroa');
  perform pg_temp.assert_that(exists (select 1 from public.activity where team_id = t and action = 'member.leader_on'
    and payload->>'name' = 'membro'), 'coroa vai para a atividade');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.team_member set is_leader = true where team_id = %s and user_id = %L', t, pg_temp.uid('leitor'))),
    'leitor não é líder');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.team_member set role = %L where team_id = %s and user_id = %L', 'viewer', t, pg_temp.uid('membro'))),
    'líder não vira leitor sem tirar a coroa');
  update public.team_member set role = 'viewer', is_leader = false where team_id = t and user_id = pg_temp.uid('membro');
  perform pg_temp.assert_that(exists (select 1 from public.activity where team_id = t and action = 'member.leader_off'),
    'tirar a coroa vai para a atividade');
  perform pg_temp.logout();

  -- ── Foto ──
  perform pg_temp.login('membro');
  perform pg_temp.assert_that(public.avatar_path_is_mine(pg_temp.uid('membro')::text || '/a.webp'), 'pasta própria é minha');
  perform pg_temp.assert_that(not public.avatar_path_is_mine(pg_temp.uid('admin')::text || '/a.webp'), 'pasta alheia não é minha');
  perform pg_temp.assert_that(not public.avatar_path_is_mine('a.webp'), 'sem pasta não é minha');
  update public.profile set avatar_path = pg_temp.uid('membro')::text || '/a.webp' where id = pg_temp.uid('membro');
  perform pg_temp.assert_that((select avatar_path from public.profile where id = pg_temp.uid('membro')) is not null,
    'cada um grava a própria foto');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.profile set avatar_path = %L where id = %L', pg_temp.uid('admin')::text || '/a.webp', pg_temp.uid('membro'))),
    'foto precisa estar na própria pasta');
  perform pg_temp.assert_that(pg_temp.affected(format(
    'update public.profile set avatar_path = null where id = %L', pg_temp.uid('admin'))) = 0,
    'ninguém muda a foto dos outros');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'update public.profile set email = %L where id = %L', 'x@x.com', pg_temp.uid('membro'))),
    'email continua fora do alcance do cliente');
  perform pg_temp.logout();

  perform pg_temp.assert_that((select public from storage.buckets where id = 'avatars'), 'bucket avatars é público');

  raise exception 'PASSOU: todos os testes da 0016 passaram';
end;
$$;
```

- [ ] **Step 2: Rodar e ver falhar**

Com o Docker Desktop aberto:

```bash
npx supabase db start
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/test-db.mjs
```

Esperado: `✗ 0016_leader_and_avatar_test.sql: column "is_leader" ... does not exist`. Se o Docker/CLI não funcionar nesta máquina, cole a migration e depois o teste no SQL Editor do **dev** (nunca do prod) e confira a mensagem.

Observação: o `test-db.mjs` só aplica migrations quando o banco está vazio. Depois de criar a migration, rode `npx supabase db reset` antes do `test-db.mjs`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/0016_leader_and_avatar.sql`:

```sql
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
```

Em `supabase/tests/auditoria_seguranca.sql`, troque o CTE `bucket_publico` por:

```sql
-- 5. Bucket público: os arquivos abririam sem URL assinada. "avatars" é público de propósito
--    (fotos de perfil, nome do arquivo é um uuid; 0016_leader_and_avatar.sql).
bucket_publico as (
  select 'Bucket público no Storage: ' || id as problema from storage.buckets where public and id <> 'avatars'
),
```

- [ ] **Step 4: Tipos**

Em `src/types/index.ts`, dentro de `TeamMember`, depois de `deactivated_at`:

```ts
  /** Coroa de líder (0016): um selo, não muda permissão. Leitor não é líder. */
  is_leader: boolean;
```

Em `Profile`, depois de `display_name`:

```ts
  /** Caminho da foto no bucket público "avatars" ("<id>/<uuid>.webp"); null = iniciais. */
  avatar_path: string | null;
```

- [ ] **Step 5: Rodar os testes e regenerar o setup**

```bash
npx supabase db reset
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/test-db.mjs
npm run gen:setup
npx tsc --noEmit
```

Esperado: `✓ 0016_leader_and_avatar_test.sql: PASSOU: ...`, todos os outros testes ✓, `✓ auditoria de segurança: nenhum problema`, `tsc` sem erros (se o mock do e2e reclamar de `is_leader` ausente, é só objeto literal sem tipo; ignore).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0016_leader_and_avatar.sql supabase/tests/0016_leader_and_avatar_test.sql supabase/tests/auditoria_seguranca.sql supabase/setup_producao.sql src/types/index.ts
git commit -m "Banco: coroa de líder e foto de perfil (0016)"
```

---

### Task 2: Migration 0017 — notificações (banco)

**Files:**
- Create: `supabase/migrations/0017_notifications.sql`
- Create: `supabase/tests/0017_notifications_test.sql`
- Modify: `src/types/index.ts`
- Regenerate: `supabase/setup_producao.sql`

**Interfaces:**
- Consumes: `team_member.is_leader` (Task 1), `public.display_name_of(uuid)`, `list.status`.
- Produces: tabela `public.notification`; funções `public.notify_due_for_card(bigint, date)` e `public.notify_due_dates()` (só triggers/cron). TS:

```ts
export type NotificationKind = "assigned" | "due_3d" | "due_1d" | "overdue" | "changed";
export type NotificationChange = "due_date" | "description" | "list" | "attachments";
export interface NotificationPayload { card_title: string; board_name: string; actor_name: string | null; actor_was_leader: boolean; due_date: string | null; days_left?: number; changes?: NotificationChange[]; attachments?: number; list_name?: string; }
export interface AppNotification { id: number; user_id: string; team_id: number; board_id: number | null; card_id: number | null; actor_id: string | null; kind: NotificationKind; due_key: string | null; payload: NotificationPayload; created_at: string; updated_at: string; read_at: string | null; }
```

- [ ] **Step 1: Escrever o teste SQL**

```bash
sed -n '/^delete from auth.users/,/^do \$\$/p' supabase/tests/0013_admin_lists_and_deactivation_test.sql | sed '$d' > supabase/tests/0017_notifications_test.sql
```

Cabeçalho:

```sql
-- Teste da 0017 (notificações). Um bloco DO que termina SEMPRE com erro.
--   Passou: erro "PASSOU: todos os testes da 0017 passaram".
--   Falhou: erro começando com "FALHOU:" (ou qualquer outro erro).
```

Bloco:

```sql
do $$
declare
  t bigint; b bigint; l_todo bigint; l_done bigint;
  c1 bigint; c2 bigint; c3 bigint; c4 bigint; c5 bigint;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_membro uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select gen_random_uuid(), n || '@rls-test.local', json_build_object('display_name', n)::jsonb, 'authenticated', 'authenticated'
  from unnest(array['admin', 'membro', 'outro', 'leitor']) n;
  v_membro := pg_temp.uid('membro');

  perform pg_temp.login('admin');
  t := public.create_team('Equipe Teste');
  insert into public.board (team_id, name, position) values (t, 'Board', 1) returning id into b;
  insert into public.list (board_id, name, position) values (b, 'A fazer', 1) returning id into l_todo;
  insert into public.list (board_id, name, position, status) values (b, 'Concluído', 2, 'done') returning id into l_done;
  perform pg_temp.logout();
  insert into public.team_member (team_id, user_id, role) values
    (t, v_membro, 'member'), (t, pg_temp.uid('outro'), 'member'), (t, pg_temp.uid('leitor'), 'viewer');
  update public.team_member set is_leader = true where team_id = t and user_id = pg_temp.uid('admin');

  -- ── Atribuição ──
  perform pg_temp.login('admin');
  insert into public.card (list_id, title, position, assignee_id, description)
    values (l_todo, 'Relatório', 1, v_membro, 'Detalhes') returning id into c1;
  insert into public.card (list_id, title, position, assignee_id) values (l_todo, 'Meu', 2, pg_temp.uid('admin'));
  perform pg_temp.logout();

  perform pg_temp.assert_that((select count(*) from public.notification where user_id = v_membro and kind = 'assigned' and card_id = c1) = 1,
    'atribuir a outra pessoa notifica');
  perform pg_temp.assert_that((select payload->>'actor_was_leader' from public.notification where card_id = c1 and kind = 'assigned') = 'true',
    'guarda que quem atribuiu era líder');
  perform pg_temp.assert_that((select payload->>'card_title' from public.notification where card_id = c1 and kind = 'assigned') = 'Relatório',
    'guarda o título');
  perform pg_temp.assert_that(not exists (select 1 from public.notification where user_id = pg_temp.uid('admin')),
    'atribuir a si mesmo não notifica');

  -- ── RLS ──
  perform pg_temp.login('outro');
  perform pg_temp.assert_that((select count(*) from public.notification) = 0, 'ninguém lê notificação dos outros');
  perform pg_temp.assert_that(pg_temp.affected('update public.notification set read_at = now()') = 0, 'ninguém marca a dos outros');
  perform pg_temp.logout();
  perform pg_temp.login('membro');
  perform pg_temp.assert_that((select count(*) from public.notification) = 1, 'cada um lê as próprias');
  perform pg_temp.assert_that(pg_temp.fails(format(
    'insert into public.notification (user_id, team_id, kind) values (%L, %s, %L)', v_membro, t, 'assigned')),
    'cliente não cria notificação');
  perform pg_temp.assert_that(pg_temp.fails('update public.notification set payload = ''{}''::jsonb'),
    'cliente só muda read_at');
  perform pg_temp.assert_that(pg_temp.fails('delete from public.notification'), 'cliente não apaga');
  perform pg_temp.logout();

  -- ── Ajuste logo depois de atribuir entra na própria atribuição ──
  perform pg_temp.login('admin');
  update public.card set due_date = v_today + 20 where id = c1;
  perform pg_temp.logout();
  perform pg_temp.assert_that(not exists (select 1 from public.notification where card_id = c1 and kind = 'changed'),
    'ajuste no primeiro minuto não vira mudança');
  perform pg_temp.assert_that((select payload->>'due_date' from public.notification where card_id = c1 and kind = 'assigned') = (v_today + 20)::text,
    'a atribuição mostra o prazo novo');

  -- ── Mudanças agrupadas ──
  update public.notification set created_at = now() - interval '2 minutes' where card_id = c1;
  perform pg_temp.login('admin');
  update public.card set description = 'Outra coisa' where id = c1;
  update public.card set list_id = l_done where id = c1;
  update public.card set list_id = l_todo where id = c1;
  perform pg_temp.logout();
  insert into public.card_attachment (card_id, name, mime_type, size_bytes, storage_path, uploaded_by, uploaded_by_name)
    values (c1, 'a.png', 'image/png', 1, c1 || '/' || gen_random_uuid(), pg_temp.uid('admin'), 'admin');
  insert into public.card_attachment (card_id, name, mime_type, size_bytes, storage_path, uploaded_by, uploaded_by_name)
    values (c1, 'b.png', 'image/png', 1, c1 || '/' || gen_random_uuid(), pg_temp.uid('admin'), 'admin');
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c1 and kind = 'changed') = 1,
    'mudanças não lidas do mesmo card ficam numa notificação só');
  perform pg_temp.assert_that((select payload->'changes' from public.notification where card_id = c1 and kind = 'changed')
    @> '["description","list","attachments"]'::jsonb, 'junta o que mudou');
  perform pg_temp.assert_that((select (payload->>'attachments')::int from public.notification where card_id = c1 and kind = 'changed') = 2,
    'soma os anexos');

  update public.notification set read_at = now() where card_id = c1;
  perform pg_temp.login('admin');
  update public.card set description = 'De novo' where id = c1;
  perform pg_temp.logout();
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c1 and kind = 'changed') = 2,
    'depois de lida, mudança nova cria outra');

  perform pg_temp.login('membro');
  update public.card set description = 'Eu mesmo' where id = c1;
  perform pg_temp.logout();
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c1 and kind = 'changed') = 2,
    'quem mexe no próprio card não se notifica');

  -- ── Avisos de prazo ──
  perform pg_temp.login('admin');
  insert into public.card (list_id, title, position, assignee_id, due_date)
    values (l_todo, 'Prazo', 3, v_membro, v_today + 3) returning id into c2;
  perform pg_temp.logout();
  perform pg_temp.assert_that((select (payload->>'days_left')::int from public.notification where card_id = c2 and kind = 'due_3d') = 3,
    'aviso de 3 dias sai na hora');
  perform public.notify_due_dates();
  perform public.notify_due_dates();
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'due_3d') = 1,
    'aviso de 3 dias sai uma vez só');
  perform public.notify_due_for_card(c2, v_today + 2);
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'due_1d') = 1, 'aviso de 1 dia');
  perform public.notify_due_for_card(c2, v_today + 1);
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'due_1d') = 1, 'sem repetir no dia do prazo');
  perform public.notify_due_for_card(c2, v_today + 4);
  perform public.notify_due_for_card(c2, v_today + 5);
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'overdue') = 1, 'atraso uma vez só');
  perform public.notify_due_for_card(c2, v_today + 30);
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'overdue') = 1, 'atraso antigo não volta');

  update public.card set due_date = v_today + 12 where id = c2;
  perform public.notify_due_for_card(c2, v_today + 10);
  perform pg_temp.assert_that((select count(*) from public.notification where card_id = c2 and kind = 'due_3d') = 2,
    'prazo novo libera avisos novos');

  perform pg_temp.login('admin');
  insert into public.card (list_id, title, position, assignee_id, due_date)
    values (l_done, 'Feito', 4, v_membro, v_today + 1) returning id into c3;
  insert into public.card (list_id, title, position, assignee_id, due_date)
    values (l_todo, 'Arquivado', 5, v_membro, v_today + 10) returning id into c4;
  update public.card set archived_at = now() where id = c4;
  insert into public.card (list_id, title, position, assignee_id, due_date)
    values (l_todo, 'Do leitor', 6, pg_temp.uid('leitor'), v_today + 1) returning id into c5;
  perform pg_temp.logout();
  perform public.notify_due_for_card(c4, v_today + 9);
  perform pg_temp.assert_that(not exists (select 1 from public.notification where card_id in (c3, c4) and kind <> 'assigned'),
    'card concluído ou arquivado não avisa prazo');
  perform pg_temp.assert_that(not exists (select 1 from public.notification where user_id = pg_temp.uid('leitor')),
    'leitor não recebe');

  -- Desativado não recebe: o card continua dele, mas mudanças não notificam. (Atribui antes de
  -- desativar: validate_card_assignee, 0013, recusa atribuir a quem já está desativado.)
  perform pg_temp.login('admin');
  update public.card set assignee_id = pg_temp.uid('outro') where id = c1;
  perform pg_temp.logout();
  delete from public.notification where user_id = pg_temp.uid('outro');
  update public.team_member set deactivated_at = now() where team_id = t and user_id = pg_temp.uid('outro');
  perform pg_temp.login('admin');
  update public.card set description = 'Depois de desativado' where id = c1;
  perform pg_temp.logout();
  perform pg_temp.assert_that(not exists (select 1 from public.notification where user_id = pg_temp.uid('outro')),
    'desativado não recebe');

  -- ── Limpeza ──
  insert into public.notification (user_id, team_id, kind, read_at, payload)
    values (v_membro, t, 'assigned', now() - interval '100 days', '{}');
  perform public.notify_due_dates();
  perform pg_temp.assert_that(not exists (select 1 from public.notification where read_at < now() - interval '90 days'),
    'lidas há mais de 90 dias são apagadas');

  perform pg_temp.assert_that(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notification'),
    'notification está no Realtime');

  raise exception 'PASSOU: todos os testes da 0017 passaram';
end;
$$;
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/test-db.mjs
```

Esperado: `✗ 0017_notifications_test.sql: relation "public.notification" does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/0017_notifications.sql`:

```sql
-- Notificações (docs/superpowers/specs/2026-10-07-lider-e-notificacoes-design.md).
--
-- Cada linha é de uma pessoa (user_id) e só ela lê e marca como lida. Ninguém insere pelo
-- cliente: triggers em card e card_attachment e o job diário (pg_cron) geram tudo.
--   assigned  — alguém pôs a pessoa como responsável de um card
--   changed   — outra pessoa mudou prazo, descrição, coluna ou anexou arquivo num card dela;
--               enquanto não lida, mudanças novas do mesmo card entram na mesma linha
--   due_3d / due_1d / overdue — avisos de prazo, uma vez por card, tipo e prazo (due_key)
-- payload guarda o que a lista mostra, com os nomes da época.
-- Não recebem: leitor, desativado, card arquivado, e quem fez a ação.

create table public.notification (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profile (id) on delete cascade,
  team_id bigint not null references public.team (id) on delete cascade,
  board_id bigint references public.board (id) on delete set null,
  card_id bigint references public.card (id) on delete set null,
  actor_id uuid references public.profile (id) on delete set null,
  kind text not null check (kind in ('assigned', 'due_3d', 'due_1d', 'overdue', 'changed')),
  -- O prazo que gerou o aviso: mudou o prazo, pode avisar de novo.
  due_key date,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz
);

create index idx_notification_user on public.notification (user_id, team_id, updated_at desc);
create unique index idx_notification_due_once on public.notification (user_id, card_id, kind, due_key)
  where kind in ('due_3d', 'due_1d', 'overdue');
create unique index idx_notification_one_unread_change on public.notification (user_id, card_id)
  where kind = 'changed' and read_at is null;

alter table public.notification enable row level security;

create policy "notification_select_own" on public.notification
  for select to authenticated using (user_id = auth.uid());
create policy "notification_update_own" on public.notification
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.notification from anon;
revoke insert, update, delete on public.notification from authenticated;
grant update (read_at) on public.notification to authenticated;

-- ─── Peças comuns ─────────────────────────────────────────────────────────────

-- Equipe do board, se a pessoa pode receber ali (ativa e não leitora); senão null.
create function public.notification_team_for(p_board_id bigint, p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select b.team_id from public.board b
  join public.team_member m on m.team_id = b.team_id and m.user_id = p_user_id
  where b.id = p_board_id and m.deactivated_at is null and m.role <> 'viewer';
$$;

create function public.notification_card_payload(p_card public.card, p_team_id bigint, p_actor uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'card_title', p_card.title,
    'board_name', (select b.name from public.board b where b.id = p_card.board_id),
    'actor_name', public.display_name_of(p_actor),
    'actor_was_leader', coalesce((select m.is_leader from public.team_member m
                                  where m.team_id = p_team_id and m.user_id = p_actor), false),
    'due_date', p_card.due_date);
$$;

-- Mudança feita por p_actor no card de outra pessoa. Logo depois de uma atribuição ainda não lida
-- (1 minuto), o ajuste entra nela; senão, junta na mudança não lida do card ou cria outra.
create function public.notify_card_changed(
  p_card public.card, p_team_id bigint, p_actor uuid, p_changes text[], p_attachments int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_payload jsonb;
begin
  update public.notification n
  set payload = n.payload || jsonb_build_object('card_title', p_card.title, 'due_date', p_card.due_date),
      updated_at = now()
  where n.user_id = p_card.assignee_id and n.card_id = p_card.id and n.kind = 'assigned'
    and n.read_at is null and n.created_at > now() - interval '1 minute';
  if found then
    return;
  end if;

  select n.id, n.payload into v_id, v_payload from public.notification n
  where n.user_id = p_card.assignee_id and n.card_id = p_card.id and n.kind = 'changed' and n.read_at is null
  for update;

  if found then
    update public.notification
    set actor_id = p_actor,
        payload = v_payload || public.notification_card_payload(p_card, p_team_id, p_actor) || jsonb_build_object(
          'changes', (select jsonb_agg(distinct c) from (
                        select jsonb_array_elements_text(coalesce(v_payload->'changes', '[]')) c
                        union select unnest(p_changes)) s),
          'attachments', coalesce((v_payload->>'attachments')::int, 0) + p_attachments,
          'list_name', (select l.name from public.list l where l.id = p_card.list_id)),
        updated_at = now()
    where id = v_id;
  else
    insert into public.notification (user_id, team_id, board_id, card_id, actor_id, kind, payload)
    values (p_card.assignee_id, p_team_id, p_card.board_id, p_card.id, p_actor, 'changed',
      public.notification_card_payload(p_card, p_team_id, p_actor) || jsonb_build_object(
        'changes', to_jsonb(p_changes),
        'attachments', p_attachments,
        'list_name', (select l.name from public.list l where l.id = p_card.list_id)));
  end if;
end;
$$;

-- ─── Avisos de prazo ──────────────────────────────────────────────────────────

-- Faltam 2–3 dias: due_3d. Falta 1: due_1d. Venceu há 1–3 dias: overdue (sai no dia seguinte e
-- tolera o job falhar um ou dois dias, sem despejar avisos de cards vencidos há meses).
create function public.notify_due_for_card(
  p_card_id bigint, p_today date default (now() at time zone 'America/Sao_Paulo')::date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.card;
  v_team bigint;
  v_days int;
  v_kind text;
begin
  select * into v_card from public.card c where c.id = p_card_id;
  if not found or v_card.archived_at is not null or v_card.assignee_id is null or v_card.due_date is null then
    return;
  end if;
  if (select l.status from public.list l where l.id = v_card.list_id) = 'done' then
    return;
  end if;
  v_team := public.notification_team_for(v_card.board_id, v_card.assignee_id);
  if v_team is null then
    return;
  end if;
  v_days := v_card.due_date - p_today;
  v_kind := case
    when v_days between -3 and -1 then 'overdue'
    when v_days = 1 then 'due_1d'
    when v_days between 2 and 3 then 'due_3d'
  end;
  if v_kind is null then
    return;
  end if;
  insert into public.notification (user_id, team_id, board_id, card_id, kind, due_key, payload)
  values (v_card.assignee_id, v_team, v_card.board_id, v_card.id, v_kind, v_card.due_date,
    public.notification_card_payload(v_card, v_team, null) || jsonb_build_object('days_left', v_days))
  on conflict (user_id, card_id, kind, due_key) where kind in ('due_3d', 'due_1d', 'overdue') do nothing;
end;
$$;

-- Job diário: avisos de todos os cards perto do prazo e limpeza das lidas há mais de 90 dias.
create function public.notify_due_dates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_id bigint;
begin
  for v_id in
    select c.id from public.card c join public.list l on l.id = c.list_id
    where c.archived_at is null and c.assignee_id is not null and l.status <> 'done'
      and c.due_date between v_today - 3 and v_today + 3
  loop
    perform public.notify_due_for_card(v_id, v_today);
  end loop;
  delete from public.notification where read_at < now() - interval '90 days';
end;
$$;

-- ─── Triggers ─────────────────────────────────────────────────────────────────

create function public.card_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_team bigint;
  v_changes text[] := '{}';
begin
  if new.assignee_id is null or new.archived_at is not null then
    return new;
  end if;
  -- Prazo perto: avisa já (quem recebe um card que vence em 2 dias não espera o job).
  if tg_op = 'INSERT' or new.due_date is distinct from old.due_date or new.assignee_id is distinct from old.assignee_id then
    perform public.notify_due_for_card(new.id);
  end if;
  if v_actor is null or v_actor = new.assignee_id then
    return new;
  end if;
  v_team := public.notification_team_for(new.board_id, new.assignee_id);
  if v_team is null then
    return new;
  end if;

  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    insert into public.notification (user_id, team_id, board_id, card_id, actor_id, kind, payload)
    values (new.assignee_id, v_team, new.board_id, new.id, v_actor, 'assigned',
      public.notification_card_payload(new, v_team, v_actor));
    return new;
  end if;

  if new.due_date is distinct from old.due_date then v_changes := v_changes || 'due_date'::text; end if;
  if new.description is distinct from old.description then v_changes := v_changes || 'description'::text; end if;
  if new.list_id is distinct from old.list_id then v_changes := v_changes || 'list'::text; end if;
  if cardinality(v_changes) > 0 then
    perform public.notify_card_changed(new, v_team, v_actor, v_changes, 0);
  end if;
  return new;
end;
$$;

create trigger card_notify
  after insert or update of assignee_id, due_date, description, list_id, archived_at on public.card
  for each row execute function public.card_notifications();

-- Anexo novo: quem enviou é uploaded_by (a Edge Function grava com service_role, sem auth.uid()).
create function public.card_attachment_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.card;
  v_team bigint;
begin
  select * into v_card from public.card c where c.id = new.card_id;
  if v_card.assignee_id is null or v_card.archived_at is not null
     or new.uploaded_by is null or new.uploaded_by = v_card.assignee_id then
    return new;
  end if;
  v_team := public.notification_team_for(v_card.board_id, v_card.assignee_id);
  if v_team is null then
    return new;
  end if;
  perform public.notify_card_changed(v_card, v_team, new.uploaded_by, array['attachments'], 1);
  return new;
end;
$$;

create trigger card_attachment_notify
  after insert on public.card_attachment
  for each row execute function public.card_attachment_notifications();

revoke execute on function
  public.notification_team_for(bigint, uuid),
  public.notification_card_payload(public.card, bigint, uuid),
  public.notify_card_changed(public.card, bigint, uuid, text[], int),
  public.notify_due_for_card(bigint, date),
  public.notify_due_dates()
from public, anon, authenticated;

-- ─── Realtime e agendamento ───────────────────────────────────────────────────

alter publication supabase_realtime add table public.notification;

-- Todo dia às 11:00 UTC (8h de Brasília). Onde não houver pg_cron, os testes chamam a função direto.
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('tododay-avisos-de-prazo', '0 11 * * *', 'select public.notify_due_dates()');
  end if;
end;
$do$;
```

- [ ] **Step 4: Tipos**

Em `src/types/index.ts`, depois de `Activity`:

```ts
/** O que gerou a notificação (0017_notifications.sql). */
export type NotificationKind = "assigned" | "due_3d" | "due_1d" | "overdue" | "changed";
export type NotificationChange = "due_date" | "description" | "list" | "attachments";

/** Guardado na época: a lista mostra isto mesmo se o card ou a pessoa mudarem depois. */
export interface NotificationPayload {
  card_title: string;
  board_name: string;
  actor_name: string | null;
  actor_was_leader: boolean;
  due_date: string | null;
  /** Avisos de prazo: dias que faltavam (negativo = atrasado). */
  days_left?: number;
  /** changed: o que mudou, sem repetição. */
  changes?: NotificationChange[];
  /** changed: quantos anexos novos. */
  attachments?: number;
  /** changed: coluna atual do card. */
  list_name?: string;
}

/** "Notification" sozinho colide com a API de notificações do navegador. */
export interface AppNotification {
  id: number;
  user_id: string;
  team_id: number;
  board_id: number | null;
  card_id: number | null;
  actor_id: string | null;
  kind: NotificationKind;
  due_key: string | null;
  payload: NotificationPayload;
  created_at: string;
  updated_at: string;
  read_at: string | null;
}
```

- [ ] **Step 5: Rodar os testes**

```bash
npx supabase db reset
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/test-db.mjs
npm run gen:setup
npx tsc --noEmit
```

Esperado: todos ✓, inclusive `0017_notifications_test.sql: PASSOU` e a auditoria. Se o `create extension pg_cron` falhar no banco local (`must be loaded via shared_preload_libraries`), troque a condição do bloco `do $do$` por `exists (select 1 from pg_available_extensions where name = 'pg_cron') and current_setting('shared_preload_libraries', true) like '%pg_cron%'` e rode de novo.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0017_notifications.sql supabase/tests/0017_notifications_test.sql supabase/setup_producao.sql src/types/index.ts
git commit -m "Banco: notificações com avisos de prazo e mudanças agrupadas (0017)"
```

---

### Task 3: Avatar com foto e coroa; membros trazem foto e coroa

**Files:**
- Modify: `src/components/ui/icons.tsx` (adicionar `IconCrown`, `IconBell`)
- Modify: `src/components/ui/Avatar.tsx`
- Create: `src/db/avatars.ts` (só `avatarPublicUrl` nesta tarefa)
- Modify: `src/db/teams.ts:25-36`, `src/db/auth.ts:83-87`
- Modify: `src/types/index.ts` (`DashboardPerson`)
- Modify: `src/components/board/CardFace.tsx`, `src/components/board/Card.tsx:89`, `src/components/card-detail/CardDetailPanel.tsx:129`, `src/components/ui/AppMenu.tsx:62`, `src/components/dashboard/DashboardView.tsx:203`, `src/components/dashboard/TaskListPanel.tsx:130`, `src/components/dashboard/TeamLoadTable.tsx:76`, `src/components/board/DemoCardPanel.tsx:56`
- Test: `src/components/ui/Avatar.test.ts` não (Vitest só cobre funções puras); a verificação é visual no Step 6.

**Interfaces:**
- Consumes: `Profile.avatar_path`, `TeamMember.is_leader` (Task 1).
- Produces:
  - `Avatar({ userId, name, title?, small?, large?, avatarUrl?: string | null, leader?: boolean })`
  - `avatarPublicUrl(path: string | null): string | null` em `src/db/avatars.ts`
  - `TeamMemberWithProfile = TeamMember & { profile: Pick<Profile, "email" | "display_name" | "avatar_path"> & { avatar_url: string | null } }`
  - `MyProfile = Profile & { avatar_url: string | null }`, retorno de `getMyProfile`
  - `DashboardPerson` ganha `avatarUrl?: string | null; isLeader?: boolean`
  - `CardFaceProps.assignee?: { id: string; name: string; avatarUrl?: string | null; isLeader?: boolean }`

- [ ] **Step 1: Ícones**

No fim de `src/components/ui/icons.tsx`:

```tsx
/** Coroa do líder: preenchida, para ler bem em 9–11px sobre a foto. */
export const IconCrown = (p: IconProps) => (
  <Icon fill="currentColor" strokeWidth={1.2} {...p}>
    <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />
  </Icon>
);

export const IconBell = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4l2-2z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </Icon>
);
```

- [ ] **Step 2: Avatar**

`src/components/ui/Avatar.tsx` inteiro:

```tsx
import { useState } from "react";
import { memberColor } from "../../lib/boardVisuals";
import { readableTextOn } from "../../lib/contrast";
import { IconCrown } from "./icons";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

interface AvatarProps {
  userId: string;
  name: string;
  title?: string;
  /** Casa com a altura do selo de prazo. */
  small?: boolean;
  /** Notificações, Equipe e Perfil. */
  large?: boolean;
  /** Foto (bucket "avatars" ou, na demonstração, uma imagem gerada). Sem ela, ou se falhar, as iniciais. */
  avatarUrl?: string | null;
  /** Coroa de líder no canto. */
  leader?: boolean;
}

/** Foto, ou iniciais numa bolinha com a cor fixa da pessoa (memberColor). */
export function Avatar({ userId, name, title, small = false, large = false, avatarUrl, leader = false }: AvatarProps) {
  const [broken, setBroken] = useState<string | null>(null);
  const color = memberColor(userId);
  const size = large ? "h-9 w-9 text-xs" : small ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]";
  const label = title ?? name;
  const showPhoto = avatarUrl && broken !== avatarUrl;
  return (
    <span title={leader && label ? `${label} · Líder` : label || undefined} className="relative inline-flex shrink-0">
      {showPhoto ? (
        <img src={avatarUrl} alt={name} onError={() => setBroken(avatarUrl)} className={`${size} rounded-full object-cover`} />
      ) : (
        <span
          style={{ backgroundColor: color, color: readableTextOn(color) }}
          className={`flex ${size} items-center justify-center rounded-full font-semibold`}
        >
          {initials(name)}
        </span>
      )}
      {leader && (
        <IconCrown
          size={large ? 14 : small ? 9 : 11}
          className="absolute -right-1 -top-1.5 rotate-12 text-highlight drop-shadow"
        />
      )}
    </span>
  );
}
```

- [ ] **Step 3: URL pública e consultas**

`src/db/avatars.ts`:

```ts
import { supabase } from "./supabase";

// Fotos de perfil no bucket público "avatars" (0016_leader_and_avatar.sql): "<user_id>/<uuid>.<ext>".

/** URL fixa da foto (o nome muda a cada troca, então pode ficar em cache para sempre). */
export function avatarPublicUrl(path: string | null): string | null {
  return path ? supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl : null;
}
```

Em `src/db/teams.ts`, troque o tipo e a função:

```ts
export type TeamMemberWithProfile = TeamMember & {
  profile: Pick<Profile, "email" | "display_name" | "avatar_path"> & { avatar_url: string | null };
};

export async function listTeamMembers(teamId: number): Promise<TeamMemberWithProfile[]> {
  const rows = must(
    await supabase
      .from("team_member")
      .select("*, profile(email, display_name, avatar_path)")
      .eq("team_id", teamId)
      .returns<(TeamMember & { profile: Pick<Profile, "email" | "display_name" | "avatar_path"> })[]>(),
  );
  return rows
    .map((m) => ({ ...m, profile: { ...m.profile, avatar_url: avatarPublicUrl(m.profile.avatar_path ?? null) } }))
    .sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name));
}
```

(com `import { avatarPublicUrl } from "./avatars";` no topo). Em `updateTeamMember`, troque `"role" | "job_title" | "deactivated_at"` por `"role" | "job_title" | "deactivated_at" | "is_leader"`; faça o mesmo em `useUpdateTeamMember` (`src/hooks/useTeams.ts`).

Em `src/db/auth.ts`:

```ts
export type MyProfile = Profile & { avatar_url: string | null };

export async function getMyProfile(userId: string): Promise<MyProfile> {
  const { data, error } = await supabase.from("profile").select("*").eq("id", userId).single();
  if (error) throw error;
  return { ...data, avatar_url: avatarPublicUrl(data.avatar_path ?? null) };
}
```

(com `import { avatarPublicUrl } from "./avatars";`).

Em `src/types/index.ts`, `DashboardPerson`:

```ts
export interface DashboardPerson {
  id: string;
  name: string;
  /** Só a demonstração preenche (imagem gerada no navegador). */
  avatarUrl?: string | null;
  isLeader?: boolean;
}
```

- [ ] **Step 4: Ligar nos lugares que já usam Avatar**

- `CardFace.tsx`: tipo `assignee?: { id: string; name: string; avatarUrl?: string | null; isLeader?: boolean };` e a linha do avatar:
  `{assignee && <Avatar userId={assignee.id} name={assignee.name} title={`Responsável: ${assignee.name}`} avatarUrl={assignee.avatarUrl} leader={assignee.isLeader} small />}`
- `Card.tsx:89`: `assignee={assignee && { id: assignee.user_id, name: assignee.profile.display_name, avatarUrl: assignee.profile.avatar_url, isLeader: assignee.is_leader }}`
- `CardDetailPanel.tsx:129`: `<Avatar userId={assignee.user_id} name={assignee.profile.display_name} avatarUrl={assignee.profile.avatar_url} leader={assignee.is_leader} />`
- `AppMenu.tsx:62`: `<Avatar userId={userId} name={name} title="" avatarUrl={profile.avatar_url} />`
- `DashboardView.tsx:203`: `<Avatar userId={p.id} name={p.name} avatarUrl={p.avatarUrl} leader={p.isLeader} />`
- `TeamLoadTable.tsx:76`: `<Avatar userId={r.person.id} name={r.person.name} avatarUrl={r.person.avatarUrl} leader={r.person.isLeader} />`
- `TaskListPanel.tsx:130`: antes do JSX do item, `const person = people.find((p) => p.id === t.assigneeId);` e `<Avatar userId={t.assigneeId} name={nameOf(t.assigneeId)} avatarUrl={person?.avatarUrl} leader={person?.isLeader} />` (se `people` não estiver no escopo desse trecho, ele vem das props do componente, linha 60).
- `DemoCardPanel.tsx:56`: `<Avatar userId={person.id} name={person.name} avatarUrl={person.avatarUrl} leader={person.isLeader} />`
- `DemoBoardView.tsx:192` já passa `person` inteiro para `assignee`: nada a fazer.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit
npm test
npm run lint
```

Esperado: tudo verde.

- [ ] **Step 6: Conferir no navegador**

`npm run dev`, abrir http://localhost:1420 com o `.env` do dev. Pelo SQL Editor do dev, `update team_member set is_leader = true where user_id = '<seu id>';`. Recarregar: a coroa laranja aparece no avatar dos seus cards e no painel do card. Desfazer o update depois.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/icons.tsx src/components/ui/Avatar.tsx src/db/avatars.ts src/db/teams.ts src/db/auth.ts src/hooks/useTeams.ts src/types/index.ts src/components/board src/components/card-detail/CardDetailPanel.tsx src/components/ui/AppMenu.tsx src/components/dashboard
git commit -m "Avatar com foto e coroa de líder"
```

---

### Task 4: Foto de perfil (enviar, trocar, remover)

**Files:**
- Create: `src/lib/avatarImage.ts`, `src/lib/avatarImage.test.ts`
- Modify: `src/db/avatars.ts`, `src/hooks/useAuth.ts`, `src/components/settings/ProfileSection.tsx`

**Interfaces:**
- Consumes: `avatarPublicUrl`, `MyProfile` (Task 3).
- Produces: `avatarFileError(file: { type: string; size: number }): string | null`, `centerSquare(w, h): { sx: number; sy: number; side: number }`, `toAvatarBlob(file: File): Promise<Blob>`, `setMyAvatar(userId, image: Blob, previousPath: string | null)`, `removeMyAvatar(userId, path: string)`, hooks `useSetAvatar(userId)`, `useRemoveAvatar(userId)`.

- [ ] **Step 1: Teste das partes puras**

`src/lib/avatarImage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { avatarFileError, centerSquare, MAX_AVATAR_INPUT_BYTES } from "./avatarImage";

describe("avatarFileError", () => {
  it("aceita PNG, JPEG e WebP", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) expect(avatarFileError({ type, size: 1000 })).toBeNull();
  });
  it("recusa outros formatos com mensagem clara", () => {
    expect(avatarFileError({ type: "image/heic", size: 1000 })).toBe("Use uma imagem PNG, JPG ou WebP.");
    expect(avatarFileError({ type: "image/gif", size: 1000 })).toBe("Use uma imagem PNG, JPG ou WebP.");
    expect(avatarFileError({ type: "", size: 1000 })).toBe("Use uma imagem PNG, JPG ou WebP.");
  });
  it("recusa arquivo grande demais antes de abrir", () => {
    expect(avatarFileError({ type: "image/png", size: MAX_AVATAR_INPUT_BYTES + 1 })).toBe("Imagem grande demais (máximo 15 MB).");
  });
});

describe("centerSquare", () => {
  it("corta o centro de uma imagem deitada", () => expect(centerSquare(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 }));
  it("corta o centro de uma imagem em pé", () => expect(centerSquare(200, 401)).toEqual({ sx: 0, sy: 100, side: 200 }));
  it("quadrada fica inteira", () => expect(centerSquare(300, 300)).toEqual({ sx: 0, sy: 0, side: 300 }));
});
```

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run src/lib/avatarImage.test.ts` → FAIL (`Cannot find module './avatarImage'`).

- [ ] **Step 3: Implementar**

`src/lib/avatarImage.ts`:

```ts
// Foto de perfil: o navegador recorta o centro em quadrado e reduz para AVATAR_SIZE antes de enviar,
// então o arquivo no bucket fica com poucos KB, seja qual for a foto original.

export const AVATAR_SIZE = 256;
/** O que se aceita escolher (antes de reduzir). O bucket aceita no máximo 2 MB já reduzido. */
export const MAX_AVATAR_INPUT_BYTES = 15 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

export function avatarFileError(file: { type: string; size: number }): string | null {
  if (!TYPES.includes(file.type)) return "Use uma imagem PNG, JPG ou WebP.";
  if (file.size > MAX_AVATAR_INPUT_BYTES) return "Imagem grande demais (máximo 15 MB).";
  return null;
}

/** O maior quadrado centralizado que cabe na imagem. */
export function centerSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

/** Recorta e reduz. WebP onde o navegador gera; senão o PNG que ele devolver (o bucket aceita os dois). */
export async function toAvatarBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { sx, sy, side } = centerSquare(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível ler a imagem."))), "image/webp", 0.85),
  );
}
```

Em `src/db/avatars.ts`, acrescente:

```ts
import { must } from "./supabase";

const EXTENSION: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

/** Envia a foto nova, aponta o perfil para ela e só então apaga a antiga. */
export async function setMyAvatar(userId: string, image: Blob, previousPath: string | null): Promise<void> {
  const path = `${userId}/${crypto.randomUUID()}.${EXTENSION[image.type] ?? "png"}`;
  const { error } = await supabase.storage.from("avatars").upload(path, image, { contentType: image.type, cacheControl: "31536000" });
  if (error) throw error;
  must(await supabase.from("profile").update({ avatar_path: path }).eq("id", userId));
  // Se apagar falhar, sobra só um arquivo sem uso; o perfil já está certo.
  if (previousPath) await supabase.storage.from("avatars").remove([previousPath]);
}

export async function removeMyAvatar(userId: string, path: string): Promise<void> {
  must(await supabase.from("profile").update({ avatar_path: null }).eq("id", userId));
  await supabase.storage.from("avatars").remove([path]);
}
```

(junte o `import { supabase } from "./supabase";` existente com `must`: `import { must, supabase } from "./supabase";`).

Em `src/hooks/useAuth.ts`, acrescente (e importe `setMyAvatar`, `removeMyAvatar` de `../db/avatars`, `toAvatarBlob` de `../lib/avatarImage`):

```ts
/** Foto nova: recorta e reduz no navegador, envia e atualiza perfil e avatares da equipe. */
export function useSetAvatar(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, previousPath }: { file: File; previousPath: string | null }) =>
      setMyAvatar(userId, await toAvatarBlob(file), previousPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
    },
  });
}

export function useRemoveAvatar(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => removeMyAvatar(userId, path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
    },
  });
}
```

- [ ] **Step 4: Tela Perfil**

Em `ProfileSection.tsx`, importe `useRef`, `useSetAvatar`, `useRemoveAvatar`, `avatarFileError` e `Avatar`. Dentro do componente, depois de `const toast = useToast();`:

```tsx
  const setAvatar = useSetAvatar(userId);
  const removeAvatar = useRemoveAvatar(userId);
  const fileInput = useRef<HTMLInputElement>(null);

  function pickPhoto(file: File | undefined) {
    if (!file || !profile) return;
    const problem = avatarFileError(file);
    if (problem) return toast({ message: problem });
    setAvatar.mutate(
      { file, previousPath: profile.avatar_path },
      {
        onSuccess: () => toast({ message: "Foto salva" }),
        onError: () => toast({ message: "Não foi possível salvar a foto. Tente outra imagem." }),
      },
    );
  }
```

E, como primeira linha dentro de `<Section title="Perfil">`:

```tsx
      <Row label="Foto">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar userId={userId} name={profile.display_name} avatarUrl={profile.avatar_url} large />
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              pickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={setAvatar.isPending}
            onClick={() => fileInput.current?.click()}
            className="btn-primary px-4 py-2 disabled:opacity-50"
          >
            {setAvatar.isPending ? "Enviando..." : profile.avatar_path ? "Trocar foto" : "Enviar foto"}
          </button>
          {profile.avatar_path && (
            <button
              type="button"
              disabled={removeAvatar.isPending}
              onClick={() =>
                removeAvatar.mutate(profile.avatar_path!, {
                  onSuccess: () => toast({ message: "Foto removida" }),
                  onError: () => toast({ message: "Não foi possível remover a foto." }),
                })
              }
              className="rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary disabled:opacity-50"
            >
              Remover foto
            </button>
          )}
        </div>
      </Row>
```

- [ ] **Step 5: Verificar**

```bash
npx vitest run src/lib/avatarImage.test.ts
npx tsc --noEmit
npm run lint
```

Esperado: PASS e sem erros. A migration 0016 precisa estar no dev (cole no SQL Editor do dev se ainda não estiver) para o passo seguinte.

- [ ] **Step 6: Conferir no navegador**

Em http://localhost:1420 → Configurações → Perfil: enviar uma foto deitada (sai recortada no centro), trocar por outra (no Storage do dev, a anterior some da pasta), remover (voltam as iniciais), tentar um `.gif` (aviso "Use uma imagem PNG, JPG ou WebP." e nada muda).

- [ ] **Step 7: Commit**

```bash
git add src/lib/avatarImage.ts src/lib/avatarImage.test.ts src/db/avatars.ts src/hooks/useAuth.ts src/components/settings/ProfileSection.tsx
git commit -m "Perfil: enviar, trocar e remover foto"
```

---

### Task 5: Coroa na tela Equipe e na atividade

**Files:**
- Modify: `src/lib/activity.ts` (switch de `describeActivity`), `src/lib/activity.test.ts`
- Modify: `src/components/team/TeamView.tsx`

**Interfaces:**
- Consumes: `TeamMemberWithProfile` com `is_leader` e `profile.avatar_url` (Task 3), `useUpdateTeamMember` aceitando `is_leader`.
- Produces: frases `member.leader_on` → "deu a coroa de líder a Ana"; `member.leader_off` → "tirou a coroa de líder de Ana".

- [ ] **Step 1: Teste**

Em `src/lib/activity.test.ts`, junto dos outros `member.*` (linha ~69):

```ts
    expect(describeActivity(activity("member.leader_on", { name: "Ana" }), "team")).toBe("deu a coroa de líder a Ana");
    expect(describeActivity(activity("member.leader_off", { name: "Ana" }), "team")).toBe("tirou a coroa de líder de Ana");
```

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run src/lib/activity.test.ts` → FAIL (recebe `"member.leader_on"`).

- [ ] **Step 3: Implementar**

Em `src/lib/activity.ts`, depois de `case "member.reactivated":`:

```ts
    case "member.leader_on":
      return `deu a coroa de líder a ${p.name}`;
    case "member.leader_off":
      return `tirou a coroa de líder de ${p.name}`;
```

Em `TeamView.tsx`:
- importe `Avatar` de `../ui/Avatar` e `IconCrown` de `../ui/icons`;
- no começo da linha de cada membro (antes de `<div className="flex min-w-[12rem] flex-1 flex-col">`): `<Avatar userId={member.user_id} name={member.profile.display_name} avatarUrl={member.profile.avatar_url} leader={member.is_leader} large />`
- dentro do `<span>` do nome, depois de `{isSelf && ...}`: `{member.is_leader && <span className="text-highlight"> · Líder</span>}`
- no `onChange` do `<select>` de papel, para quem vira leitor perder a coroa junto:

```tsx
                    onChange={(e) => {
                      const role = e.target.value as MemberRole;
                      updateMember.mutate({
                        userId: member.user_id,
                        changes: role === "viewer" && member.is_leader ? { role, is_leader: false } : { role },
                      });
                    }}
```

- depois do `<select>`/rótulo de papel, o botão da coroa (só admin, só para quem não é leitor nem desativado):

```tsx
                {isAdmin && !deactivated && member.role !== "viewer" && (
                  <button
                    type="button"
                    onClick={() => updateMember.mutate({ userId: member.user_id, changes: { is_leader: !member.is_leader } })}
                    title={member.is_leader ? "Tira a coroa de líder" : "Marca como líder: a coroa aparece onde a pessoa aparece"}
                    className="flex items-center gap-1 rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-surface hover:text-text-primary"
                  >
                    <IconCrown size={14} className={member.is_leader ? "text-highlight" : ""} />
                    {member.is_leader ? "Tirar coroa" : "Tornar líder"}
                  </button>
                )}
```

- [ ] **Step 4: Verificar**

```bash
npx vitest run src/lib/activity.test.ts
npx tsc --noEmit
npm run lint
```

No navegador (dev com a 0016): Equipe → "Tornar líder" num membro → coroa no avatar e "· Líder"; a atividade recente mostra "deu a coroa de líder a ...". Mudar essa pessoa para Leitor tira a coroa sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity.ts src/lib/activity.test.ts src/components/team/TeamView.tsx
git commit -m "Equipe: tornar líder e tirar a coroa"
```

---

### Task 6: Modelo das notificações (funções puras)

**Files:**
- Create: `src/lib/notifications.ts`, `src/lib/notifications.test.ts`

**Interfaces:**
- Consumes: `AppNotification`, `NotificationPayload`, `NotificationKind` (Task 2); `daysBetween` de `./metrics`.
- Produces:

```ts
export interface NotificationActor { id: string; name: string; avatarUrl: string | null; isLeader: boolean }
export interface NotificationThumb { id: string; name: string; url: string | null; isImage: boolean }
export interface NotificationItem {
  id: string; kind: NotificationKind; read: boolean; at: string;
  actor: NotificationActor | null; fromLeader: boolean;
  sentence: string; cardTitle: string; boardName: string; excerpt: string;
  thumbs: NotificationThumb[]; extraThumbs: number;
  boardId: number | null; cardId: number | null;
}
export type NotificationFilter = "all" | "unread" | "leader";
export const MAX_THUMBS = 4;
export function joinPt(parts: string[]): string;
export function notificationSentence(kind: NotificationKind, p: NotificationPayload, today: string): string;
export function splitThumbs(all: NotificationThumb[]): { thumbs: NotificationThumb[]; extra: number };
export function excerptOf(description: string | null | undefined): string;
export function filterNotifications(items: NotificationItem[], filter: NotificationFilter): NotificationItem[];
export function bellLabel(unread: number): string | null;
export function toNotificationItem(
  row: AppNotification & { card: { description: string; archived_at: string | null } | null },
  actor: { name: string; avatarUrl: string | null } | null,
  thumbs: NotificationThumb[],
  today: string,
): NotificationItem;
```

- [ ] **Step 1: Testes**

`src/lib/notifications.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AppNotification, NotificationPayload } from "../types";
import {
  bellLabel,
  excerptOf,
  filterNotifications,
  joinPt,
  notificationSentence,
  splitThumbs,
  toNotificationItem,
  type NotificationItem,
  type NotificationThumb,
} from "./notifications";

const TODAY = "2026-10-07";
const base: NotificationPayload = { card_title: "Relatório", board_name: "Operações", actor_name: "Ana Souza", actor_was_leader: false, due_date: "2026-10-10" };

describe("joinPt", () => {
  it("junta com vírgula e 'e'", () => {
    expect(joinPt(["a"])).toBe("a");
    expect(joinPt(["a", "b"])).toBe("a e b");
    expect(joinPt(["a", "b", "c"])).toBe("a, b e c");
  });
});

describe("notificationSentence", () => {
  it("atribuição", () => {
    expect(notificationSentence("assigned", base, TODAY)).toBe("Ana Souza atribuiu a você");
    expect(notificationSentence("assigned", { ...base, actor_name: null }, TODAY)).toBe("Atribuído a você");
  });
  it("avisos de prazo", () => {
    expect(notificationSentence("due_3d", { ...base, days_left: 3 }, TODAY)).toBe("Vence em 3 dias");
    expect(notificationSentence("due_3d", { ...base, days_left: 2 }, TODAY)).toBe("Vence em 2 dias");
    expect(notificationSentence("due_1d", base, TODAY)).toBe("Vence amanhã");
  });
  it("atraso conta a partir do prazo, não da notificação", () => {
    expect(notificationSentence("overdue", { ...base, due_date: "2026-10-06" }, TODAY)).toBe("Atrasou: venceu ontem");
    expect(notificationSentence("overdue", { ...base, due_date: "2026-10-02" }, TODAY)).toBe("Atrasada há 5 dias");
  });
  it("mudanças agrupadas", () => {
    expect(notificationSentence("changed", { ...base, changes: ["due_date"] }, TODAY)).toBe("Ana Souza mudou o prazo");
    expect(
      notificationSentence("changed", { ...base, changes: ["due_date", "attachments", "list"], attachments: 2, list_name: "Fazendo" }, TODAY),
    ).toBe("Ana Souza mudou o prazo, moveu para Fazendo e anexou 2 arquivos");
    expect(notificationSentence("changed", { ...base, changes: ["attachments"], attachments: 1 }, TODAY)).toBe("Ana Souza anexou 1 arquivo");
    expect(notificationSentence("changed", { ...base, changes: ["description"] }, TODAY)).toBe("Ana Souza editou a descrição");
  });
});

describe("splitThumbs", () => {
  const t = (i: number): NotificationThumb => ({ id: String(i), name: `${i}.png`, url: null, isImage: true });
  it("mostra até 4 e conta o resto", () => {
    expect(splitThumbs([1, 2, 3].map(t))).toEqual({ thumbs: [1, 2, 3].map(t), extra: 0 });
    expect(splitThumbs([1, 2, 3, 4, 5, 6].map(t))).toEqual({ thumbs: [1, 2, 3, 4].map(t), extra: 2 });
  });
});

describe("excerptOf", () => {
  it("tira markdown simples e corta em 160 caracteres", () => {
    expect(excerptOf("## Título\n\n**Pode** assumir?")).toBe("Título Pode assumir?");
    expect(excerptOf("x".repeat(200))).toBe(`${"x".repeat(159)}…`);
    expect(excerptOf(null)).toBe("");
  });
});

describe("bellLabel", () => {
  it("sem não lidas não mostra nada; acima de 9 vira 9+", () => {
    expect(bellLabel(0)).toBeNull();
    expect(bellLabel(3)).toBe("3");
    expect(bellLabel(9)).toBe("9");
    expect(bellLabel(10)).toBe("9+");
  });
});

const row = (over: Partial<AppNotification> = {}) => ({
  id: 7,
  user_id: "u",
  team_id: 1,
  board_id: 2,
  card_id: 3,
  actor_id: "a",
  kind: "assigned" as const,
  due_key: null,
  payload: { ...base, actor_was_leader: true },
  created_at: "2026-10-07T10:00:00Z",
  updated_at: "2026-10-07T11:00:00Z",
  read_at: null,
  card: { description: "Pode assumir?", archived_at: null },
  ...over,
});

describe("toNotificationItem", () => {
  it("monta o item com o ator atual e o destaque de líder da época", () => {
    const item = toNotificationItem(row(), { name: "Ana S.", avatarUrl: "https://x/a.webp" }, [], TODAY);
    expect(item).toMatchObject({
      id: "7",
      read: false,
      at: "2026-10-07T11:00:00Z",
      fromLeader: true,
      actor: { id: "a", name: "Ana S.", avatarUrl: "https://x/a.webp", isLeader: true },
      sentence: "Ana Souza atribuiu a você",
      cardTitle: "Relatório",
      boardName: "Operações",
      excerpt: "Pode assumir?",
      boardId: 2,
      cardId: 3,
    });
  });
  it("quem saiu da equipe aparece com o nome da época, sem foto", () => {
    const item = toNotificationItem(row(), null, [], TODAY);
    expect(item.actor).toEqual({ id: "a", name: "Ana Souza", avatarUrl: null, isLeader: true });
  });
  it("card apagado ou arquivado fica sem link", () => {
    expect(toNotificationItem(row({ card_id: null, card: null }), null, [], TODAY).cardId).toBeNull();
    expect(toNotificationItem(row({ card: { description: "", archived_at: "2026-10-01T00:00:00Z" } }), null, [], TODAY).cardId).toBeNull();
  });
  it("aviso do sistema não tem ator", () => {
    const item = toNotificationItem(row({ kind: "due_1d", actor_id: null, payload: { ...base, actor_name: null } }), null, [], TODAY);
    expect(item.actor).toBeNull();
    expect(item.fromLeader).toBe(false);
  });
});

describe("filterNotifications", () => {
  const item = (id: string, read: boolean, fromLeader: boolean) => ({ id, read, fromLeader }) as NotificationItem;
  const items = [item("1", false, true), item("2", true, false), item("3", false, false)];
  it("filtra por não lidas e por líder", () => {
    expect(filterNotifications(items, "all").map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(filterNotifications(items, "unread").map((i) => i.id)).toEqual(["1", "3"]);
    expect(filterNotifications(items, "leader").map((i) => i.id)).toEqual(["1"]);
  });
});
```

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run src/lib/notifications.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

`src/lib/notifications.ts`:

```ts
// Notificações na tela: o mesmo modelo para as do banco (0017_notifications.sql) e as da
// demonstração (demoNotifications.ts). Só funções puras; a frase sai do payload guardado na época.
import type { AppNotification, NotificationKind, NotificationPayload } from "../types";
import { daysBetween } from "./metrics";

export interface NotificationActor {
  id: string;
  name: string;
  avatarUrl: string | null;
  isLeader: boolean;
}

export interface NotificationThumb {
  id: string;
  name: string;
  /** URL assinada (banco) ou blob: (demonstração); null enquanto carrega. */
  url: string | null;
  isImage: boolean;
}

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  read: boolean;
  /** Última mudança (uma notificação agrupada sobe ao receber mais mudanças). */
  at: string;
  /** null = aviso do sistema (prazo). */
  actor: NotificationActor | null;
  /** Quem fez era líder na época. */
  fromLeader: boolean;
  sentence: string;
  cardTitle: string;
  boardName: string;
  excerpt: string;
  thumbs: NotificationThumb[];
  extraThumbs: number;
  /** null = sem link (card apagado, arquivado ou da demonstração). */
  boardId: number | null;
  cardId: number | null;
}

export type NotificationFilter = "all" | "unread" | "leader";

export const MAX_THUMBS = 4;
const EXCERPT_LENGTH = 160;

export function joinPt(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

export function notificationSentence(kind: NotificationKind, p: NotificationPayload, today: string): string {
  switch (kind) {
    case "assigned":
      return p.actor_name ? `${p.actor_name} atribuiu a você` : "Atribuído a você";
    case "due_3d":
      return `Vence em ${p.days_left ?? 3} dias`;
    case "due_1d":
      return "Vence amanhã";
    case "overdue": {
      const late = p.due_date ? daysBetween(p.due_date, today) : 1;
      return late <= 1 ? "Atrasou: venceu ontem" : `Atrasada há ${late} dias`;
    }
    case "changed": {
      const n = p.attachments ?? 0;
      const parts = (p.changes ?? []).map((c) =>
        c === "due_date"
          ? "mudou o prazo"
          : c === "description"
            ? "editou a descrição"
            : c === "list"
              ? `moveu para ${p.list_name ?? "outra coluna"}`
              : n === 1
                ? "anexou 1 arquivo"
                : `anexou ${n} arquivos`,
      );
      return `${p.actor_name ?? "Alguém"} ${joinPt(parts)}`;
    }
  }
}

export function splitThumbs(all: NotificationThumb[]): { thumbs: NotificationThumb[]; extra: number } {
  return { thumbs: all.slice(0, MAX_THUMBS), extra: Math.max(0, all.length - MAX_THUMBS) };
}

/** Descrição em uma linha, sem os marcadores de markdown mais comuns. */
export function excerptOf(description: string | null | undefined): string {
  const text = (description ?? "")
    .replace(/[#*_`>~-]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1)}…` : text;
}

export function filterNotifications(items: NotificationItem[], filter: NotificationFilter): NotificationItem[] {
  if (filter === "unread") return items.filter((i) => !i.read);
  if (filter === "leader") return items.filter((i) => i.fromLeader);
  return items;
}

/** Texto do contador do sino; null = sem contador. */
export function bellLabel(unread: number): string | null {
  if (unread <= 0) return null;
  return unread > 9 ? "9+" : String(unread);
}

/**
 * Linha do banco → item da tela. `actor` é a pessoa hoje na equipe (nome e foto atuais); se ela
 * saiu, fica o nome da época, sem foto.
 */
export function toNotificationItem(
  row: AppNotification & { card: { description: string; archived_at: string | null } | null },
  actor: { name: string; avatarUrl: string | null } | null,
  thumbs: NotificationThumb[],
  today: string,
): NotificationItem {
  const p = row.payload;
  const split = splitThumbs(thumbs);
  const linkable = row.card_id !== null && row.card !== null && row.card.archived_at === null;
  return {
    id: String(row.id),
    kind: row.kind,
    read: row.read_at !== null,
    at: row.updated_at,
    actor: row.actor_id
      ? {
          id: row.actor_id,
          name: actor?.name ?? p.actor_name ?? "?",
          avatarUrl: actor?.avatarUrl ?? null,
          isLeader: p.actor_was_leader,
        }
      : null,
    fromLeader: row.actor_id !== null && p.actor_was_leader,
    sentence: notificationSentence(row.kind, p, today),
    cardTitle: p.card_title,
    boardName: p.board_name,
    excerpt: excerptOf(row.card?.description),
    thumbs: split.thumbs,
    extraThumbs: split.extra,
    boardId: linkable ? row.board_id : null,
    cardId: linkable ? row.card_id : null,
  };
}
```

Nota sobre o teste "quem saiu da equipe": `actor` é `null`, então o nome vem de `p.actor_name` ("Ana Souza"). No teste do primeiro caso, o nome atual "Ana S." vence o da época. A frase usa sempre `p.actor_name` (da época), igual ao histórico.

- [ ] **Step 4: Ver passar**

Run: `npx vitest run src/lib/notifications.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications.ts src/lib/notifications.test.ts
git commit -m "Notificações: modelo da tela, frases, filtros e contador"
```

---

### Task 7: Notificações reais — dados, Realtime e hooks

**Files:**
- Create: `src/db/notifications.ts`, `src/hooks/useNotifications.ts`
- Modify: `src/db/realtime.ts`, `src/hooks/useRealtimeSync.ts`, `src/App.tsx` (chamada do `useRealtimeSync`)

**Interfaces:**
- Consumes: `toNotificationItem`, `NotificationThumb`, `NotificationItem` (Task 6); `useTeamMembers` (TeamMemberWithProfile com `avatar_url`); `useAttachmentUrls` de `src/hooks/useAttachments.ts`; `localDay` de `src/lib/dashboardRules.ts`.
- Produces:

```ts
// src/db/notifications.ts
export type NotificationRow = AppNotification & { card: { description: string; archived_at: string | null } | null };
export async function listNotifications(teamId: number): Promise<NotificationRow[]>;
export async function markNotificationRead(id: number): Promise<void>;
export async function markAllNotificationsRead(teamId: number): Promise<void>;
export type NotificationAttachment = Pick<CardAttachment, "id" | "card_id" | "name" | "mime_type" | "storage_path">;
export async function listNotificationAttachments(cardIds: number[]): Promise<NotificationAttachment[]>;

// src/hooks/useNotifications.ts
export interface NotificationsState { items: NotificationItem[]; unread: number; isError: boolean; markRead: (item: NotificationItem) => void; markAllRead: () => void; }
export function useTeamNotifications(teamId: number): NotificationsState;

// realtime
export function subscribeToChanges(teamId: number, boardId: number | null, userId: string, onChange: (table: RealtimeTable) => void): () => void;
export function useRealtimeSync(teamId: number, boardId: number | null, userId: string): void;
```

- [ ] **Step 1: Camada de dados**

`src/db/notifications.ts`:

```ts
import { must, supabase } from "./supabase";
import type { AppNotification, CardAttachment } from "../types";

// Notificações da pessoa logada (a RLS só devolve as dela). Só lê e marca como lida: quem cria é o
// banco (0017_notifications.sql).

export type NotificationRow = AppNotification & { card: { description: string; archived_at: string | null } | null };

/** As 100 mais recentes da equipe (o contador do sino sai daqui). */
export async function listNotifications(teamId: number): Promise<NotificationRow[]> {
  return must(
    await supabase
      .from("notification")
      .select("*, card(description, archived_at)")
      .eq("team_id", teamId)
      .order("updated_at", { ascending: false })
      .limit(100)
      .returns<NotificationRow[]>(),
  );
}

export async function markNotificationRead(id: number): Promise<void> {
  must(await supabase.from("notification").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null));
}

export async function markAllNotificationsRead(teamId: number): Promise<void> {
  must(await supabase.from("notification").update({ read_at: new Date().toISOString() }).eq("team_id", teamId).is("read_at", null));
}

export type NotificationAttachment = Pick<CardAttachment, "id" | "card_id" | "name" | "mime_type" | "storage_path">;

/** Anexos atuais dos cards das notificações, para as miniaturas. */
export async function listNotificationAttachments(cardIds: number[]): Promise<NotificationAttachment[]> {
  if (cardIds.length === 0) return [];
  return must(
    await supabase
      .from("card_attachment")
      .select("id, card_id, name, mime_type, storage_path")
      .in("card_id", cardIds)
      .order("created_at"),
  );
}
```

- [ ] **Step 2: Realtime da pessoa**

Em `src/db/realtime.ts`: acrescente `"notification"` ao tipo `RealtimeTable`, mude a assinatura para `subscribeToChanges(teamId: number, boardId: number | null, userId: string, onChange: ...)`, o nome do canal para `` `team-${teamId}-board-${boardId ?? "none"}-user-${userId}` `` e, depois de `listen("activity", ...)`:

```ts
  // As notificações da pessoa, em qualquer board (a RLS também só entrega as dela).
  listen("notification", `user_id=eq.${userId}`);
```

Atualize o comentário do topo: "Avisa (só o nome da tabela) quando algo muda nos boards da equipe, no board aberto ou nas notificações da pessoa."

Em `src/hooks/useRealtimeSync.ts`: assinatura `useRealtimeSync(teamId: number, boardId: number | null, userId: string)`, no `switch`:

```ts
        case "notification":
          return [["notifications"]];
```

passe `userId` para `subscribeToChanges(teamId, boardId, userId, ...)` e acrescente `userId` às dependências do `useEffect`. Em `src/App.tsx`, `useRealtimeSync(team.id, activeBoard?.id ?? null, userId);`.

- [ ] **Step 3: Hook que monta os itens**

`src/hooks/useNotifications.ts`:

```ts
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listNotificationAttachments,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../db/notifications";
import { localDay } from "../lib/dashboardRules";
import { toNotificationItem, type NotificationItem, type NotificationThumb } from "../lib/notifications";
import { useAttachmentUrls } from "./useAttachments";
import { useTeamMembers } from "./useTeams";

/** O que o sino e a aba precisam, venha do banco ou da demonstração. */
export interface NotificationsState {
  items: NotificationItem[];
  unread: number;
  isError: boolean;
  markRead: (item: NotificationItem) => void;
  markAllRead: () => void;
}

export function useTeamNotifications(teamId: number): NotificationsState {
  const queryClient = useQueryClient();
  const { data: rows, isError } = useQuery({ queryKey: ["notifications", teamId], queryFn: () => listNotifications(teamId) });
  const { data: members } = useTeamMembers(teamId);

  // Miniaturas só das não lidas e das 20 primeiras: é o que está à vista.
  const cardIds = useMemo(
    () => [...new Set((rows ?? []).slice(0, 20).flatMap((r) => (r.card_id !== null && r.card ? [r.card_id] : [])))],
    [rows],
  );
  const { data: attachments } = useQuery({
    queryKey: ["notificationAttachments", cardIds],
    queryFn: () => listNotificationAttachments(cardIds),
    enabled: cardIds.length > 0,
  });
  const images = useMemo(() => (attachments ?? []).filter((a) => a.mime_type.startsWith("image/")), [attachments]);
  const { data: urls } = useAttachmentUrls(images);

  const items = useMemo(() => {
    const today = localDay(new Date());
    return (rows ?? []).map((row) => {
      const member = row.actor_id ? members?.find((m) => m.user_id === row.actor_id) : undefined;
      const thumbs: NotificationThumb[] = (attachments ?? [])
        .filter((a) => a.card_id === row.card_id)
        .map((a) => ({
          id: String(a.id),
          name: a.name,
          url: a.mime_type.startsWith("image/") ? urls?.get(a.storage_path) ?? null : null,
          isImage: a.mime_type.startsWith("image/"),
        }));
      return toNotificationItem(
        row,
        member ? { name: member.profile.display_name, avatarUrl: member.profile.avatar_url } : null,
        thumbs,
        today,
      );
    });
  }, [rows, members, attachments, urls]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications", teamId] });
  const markOne = useMutation({ mutationFn: (id: number) => markNotificationRead(id), onSettled: invalidate });
  const markAll = useMutation({ mutationFn: () => markAllNotificationsRead(teamId), onSettled: invalidate });

  return {
    items,
    unread: items.filter((i) => !i.read).length,
    isError,
    markRead: (item) => {
      if (!item.read) markOne.mutate(Number(item.id));
    },
    markAllRead: () => markAll.mutate(),
  };
}
```

Confira em `src/db/attachments.ts:101` que `signAttachmentUrls` devolve `Map<storage_path, url>` (devolve; `useAttachmentUrls` recebe objetos com `storage_path`).

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit
npm test
npm run lint
```

Esperado: verde. (A tela vem na Task 8; aqui não há mudança visível.)

- [ ] **Step 5: Commit**

```bash
git add src/db/notifications.ts src/hooks/useNotifications.ts src/db/realtime.ts src/hooks/useRealtimeSync.ts src/App.tsx
git commit -m "Notificações: leitura, marcar como lida e Realtime da pessoa"
```

---

### Task 8: Aba Notificações e sino

**Files:**
- Create: `src/components/notifications/NotificationsView.tsx`, `src/components/notifications/NotificationBell.tsx`
- Modify: `src/components/ui/AppMenu.tsx` (`AppView`, item do menu), `src/App.tsx`
- Test: `e2e/layout.spec.ts`

**Interfaces:**
- Consumes: `NotificationsState`, `useTeamNotifications` (Task 7); `NotificationItem`, `filterNotifications`, `bellLabel`, `NotificationFilter` (Task 6); `Avatar` (Task 3); `relativeTime` de `src/lib/activity.ts`; `IconBell`, `IconPaperclip`.
- Produces: `AppView` inclui `"notifications"`; `NotificationsView({ state, isDemo, onBack, onOpen })`; `NotificationBell({ unread, active, onClick })`.

- [ ] **Step 1: e2e simulado (falha)**

Em `e2e/layout.spec.ts`, depois do último teste:

```ts
test("notificações: sino com contador, filtro Do líder e clique abre o card", async ({ page }) => {
  const payload = (over: object) => ({
    card_title: "Card 3",
    board_name: "Board E2E",
    actor_name: "Ana Líder",
    actor_was_leader: true,
    due_date: null,
    ...over,
  });
  const notification = [
    { id: 1, user_id: USER_ID, team_id: 1, board_id: 1, card_id: 3, actor_id: "00000000-0000-0000-0000-0000000000aa", kind: "assigned", due_key: null,
      payload: payload({}), created_at: NOW, updated_at: NOW, read_at: null, card: { description: "**Pode** assumir?", archived_at: null } },
    { id: 2, user_id: USER_ID, team_id: 1, board_id: 1, card_id: 4, actor_id: null, kind: "due_1d", due_key: "2026-09-29",
      payload: payload({ card_title: "Card 4", actor_name: null, actor_was_leader: false }), created_at: NOW, updated_at: NOW, read_at: null,
      card: { description: "", archived_at: null } },
  ];
  await openLongBoard(page, "/", { notification });

  const bell = page.getByRole("button", { name: /Notificações/ });
  await expect(bell).toContainText("2");
  await bell.click();
  await expect(page.getByText("Ana Líder atribuiu a você")).toBeVisible();
  await expect(page.getByText("Pedido do líder")).toBeVisible();
  await expect(page.getByText("Pode assumir?")).toBeVisible();
  await expect(page.getByText("Vence amanhã")).toBeVisible();

  await page.getByRole("button", { name: "Do líder" }).click();
  await expect(page.getByText("Vence amanhã")).toBeHidden();

  await page.getByText("Ana Líder atribuiu a você").click();
  await expect(page.getByRole("dialog").getByText("Card 3")).toBeVisible();
});
```

Run: `npm run test:e2e:mock -- -g "notificações"` → FAIL (não há botão "Notificações").

Se o painel do card no app não for `role="dialog"`, troque a última verificação por `await expect(page).toHaveURL(/card=3/)`.

- [ ] **Step 2: Sino**

`src/components/notifications/NotificationBell.tsx`:

```tsx
import { bellLabel } from "../../lib/notifications";
import { IconBell } from "../ui/icons";

/** Ao lado do menu da pessoa: abre a aba Notificações. O número fica sempre escrito. */
export function NotificationBell({ unread, active, onClick }: { unread: number; active: boolean; onClick: () => void }) {
  const label = bellLabel(unread);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ? `Notificações, ${unread} não lidas` : "Notificações"}
      aria-pressed={active}
      className={`relative mr-1 shrink-0 rounded-xl p-2 hover:bg-bg-elevated ${active ? "text-primary" : "text-text-muted hover:text-text-primary"}`}
    >
      <IconBell size={18} />
      {label && (
        <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-[1.1rem] text-on-accent">
          {label}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 3: Aba**

`src/components/notifications/NotificationsView.tsx`:

```tsx
import { useState } from "react";
import type { NotificationsState } from "../../hooks/useNotifications";
import { relativeTime } from "../../lib/activity";
import { filterNotifications, type NotificationFilter, type NotificationItem } from "../../lib/notifications";
import { Avatar } from "../ui/Avatar";
import { EmptyState } from "../ui/EmptyState";
import { IconBell, IconPaperclip } from "../ui/icons";
import { PageHeader } from "../ui/PageHeader";
import { BrandMark } from "../ui/BrandMark";

const FILTERS: { id: NotificationFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "leader", label: "Do líder" },
];

interface NotificationsViewProps {
  state: NotificationsState;
  /** Demonstração: notificações fictícias, aviso no topo. */
  isDemo: boolean;
  onBack: () => void;
  /** Clicou num item: marca como lida e abre o card (quem chama decide para onde ir). */
  onOpen: (item: NotificationItem) => void;
}

export function NotificationsView({ state, isDemo, onBack, onOpen }: NotificationsViewProps) {
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const visible = filterNotifications(state.items, filter);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <PageHeader title="Notificações" onBack={onBack} />
      <div className="flex max-w-2xl flex-col gap-4">
        {isDemo && (
          <p className="rounded-xl bg-bg-elevated px-3 py-2 text-sm text-text-muted">
            Demonstração: notificações fictícias, geradas a partir das tarefas de exemplo.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-xl bg-bg-elevated p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-lg px-3 py-1 text-sm ${
                  filter === f.id ? "bg-bg-surface font-semibold text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {state.unread > 0 && (
            <button type="button" onClick={state.markAllRead} className="ml-auto rounded-lg px-3 py-1 text-sm text-primary hover:bg-bg-elevated">
              Marcar todas como lidas
            </button>
          )}
        </div>

        {state.isError ? (
          <EmptyState icon={<IconBell size={22} />} title="Não foi possível carregar as notificações." description="Verifique sua internet e tente de novo." />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<IconBell size={22} />}
            title={filter === "all" ? "Nenhuma notificação." : "Nada aqui."}
            description="Quando alguém atribuir um card a você, um prazo chegar perto ou mudarem um card seu, aparece aqui."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((item) => (
              <li key={item.id}>
                <NotificationRow item={item} onOpen={() => onOpen(item)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full gap-3 rounded-xl border px-3 py-3 text-left hover:border-highlight ${
        item.read ? "border-border bg-bg-card" : "border-border bg-bg-elevated"
      }`}
    >
      {item.actor ? (
        <Avatar userId={item.actor.id} name={item.actor.name} avatarUrl={item.actor.avatarUrl} leader={item.actor.isLeader} large />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-surface" title="Aviso do Tododay">
          <BrandMark compact />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          {!item.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Não lida" />}
          <span className={`text-sm ${item.read ? "text-text-primary" : "font-semibold text-text-primary"}`}>{item.sentence}</span>
          {item.fromLeader && (
            <span className="rounded-full border border-highlight px-2 text-[11px] font-semibold text-highlight">Pedido do líder</span>
          )}
          <span className="ml-auto text-xs text-text-muted">{relativeTime(item.at)}</span>
        </span>
        <span className="truncate text-sm text-text-primary">
          {item.cardTitle} <span className="text-text-muted">· {item.boardName}</span>
        </span>
        {item.excerpt && <span className="line-clamp-2 text-xs text-text-muted">{item.excerpt}</span>}
        {(item.thumbs.length > 0 || item.extraThumbs > 0) && (
          <span className="flex flex-wrap items-center gap-2 pt-1">
            {item.thumbs.map((t) =>
              t.isImage && t.url ? (
                <img key={t.id} src={t.url} alt={t.name} className="h-12 w-16 rounded-lg border border-border object-cover" />
              ) : (
                <span key={t.id} className="flex h-12 max-w-[8rem] items-center gap-1 rounded-lg border border-border px-2 text-xs text-text-muted">
                  <IconPaperclip size={12} />
                  <span className="truncate">{t.name}</span>
                </span>
              ),
            )}
            {item.extraThumbs > 0 && <span className="text-xs text-text-muted">+{item.extraThumbs}</span>}
          </span>
        )}
      </span>
    </button>
  );
}
```

Antes de usar `<BrandMark compact />`, confira as props de `src/components/ui/BrandMark.tsx`. Se não houver uma versão só com o símbolo, troque por `<IconBell size={16} className="text-text-muted" />`.

- [ ] **Step 4: Ligar no App e no menu**

Em `AppMenu.tsx`: `export type AppView = "board" | "archive" | "team" | "settings" | "dashboard" | "my-tasks" | "notifications";`, importe `IconBell` e acrescente antes de "Minhas tarefas":

```tsx
            <Item view={view} onGo={go} target="notifications" icon={<IconBell size={16} />}>Notificações</Item>
```

Em `App.tsx` (`TeamWorkspace`):

```tsx
import { NotificationBell } from "./components/notifications/NotificationBell";
import { NotificationsView } from "./components/notifications/NotificationsView";
import { useTeamNotifications } from "./hooks/useNotifications";
```

Depois de `const activeBoard = ...`:

```tsx
  const notifications = useTeamNotifications(team.id);
```

No cabeçalho, antes de `<AppMenu ... />`:

```tsx
        <NotificationBell unread={notifications.unread} active={view === "notifications"} onClick={() => navigate("notifications")} />
```

No encadeamento de views, antes de `view === "my-tasks" ? (`:

```tsx
      ) : view === "notifications" ? (
        <NotificationsView
          state={notifications}
          isDemo={false}
          onBack={() => setView("board")}
          onOpen={(item) => {
            notifications.markRead(item);
            if (item.cardId !== null && item.boardId !== null) {
              handleNavigate({ type: "card", id: item.cardId, title: item.cardTitle, board_id: item.boardId, board_name: item.boardName });
            }
          }}
        />
```

(A demonstração entra na Task 9 trocando `notifications` e `isDemo`.)

- [ ] **Step 5: Ver passar**

```bash
npm run test:e2e:mock
npx tsc --noEmit
npm run lint
```

Esperado: o teste novo e os antigos passam (os antigos recebem `[]` para `notification` e o sino fica sem número).

- [ ] **Step 6: Conferir no dev de verdade**

Com as migrations 0016 e 0017 aplicadas no dev (SQL Editor do dev): duas contas na mesma equipe, a conta A (líder) atribui um card com descrição e uma imagem anexada à conta B. Na janela da conta B o contador sobe sem recarregar; a aba mostra foto/coroa de A, "Pedido do líder", a descrição e a miniatura; clicar abre o card e o contador desce.

- [ ] **Step 7: Commit**

```bash
git add src/components/notifications src/components/ui/AppMenu.tsx src/App.tsx e2e/layout.spec.ts
git commit -m "Aba Notificações e sino com contador"
```

---

### Task 9: Demonstração — fotos, coroa e notificações fictícias

**Files:**
- Create: `src/lib/demoAvatars.ts`, `src/lib/demoNotifications.ts`, `src/lib/demoNotifications.test.ts`, `src/hooks/useDemoFiles.ts`
- Modify: `src/lib/demoData.ts` (`DEMO_PEOPLE`), `src/lib/demoData.test.ts` (linha 16), `src/components/board/DemoBoardView.tsx` (mover `useDemoFiles`), `src/hooks/useNotifications.ts` (`useDemoNotifications`), `src/App.tsx`

**Interfaces:**
- Consumes: `DashboardData`, `DashboardPerson.avatarUrl/isLeader` (Task 3); `demoAttachments`, `demoBoard`, `DemoAttachment` de `src/lib/demoBoard.ts`; `NotificationItem`, `splitThumbs`, `notificationSentence` (Task 6); `NotificationsState` (Task 7); `isOverdue` não (usa dias direto).
- Produces:
  - `demoAvatarUrl(id: string, name: string): string` (data URL SVG, pura)
  - `demoNotifications(d: DashboardData, attachments: Map<string, DemoAttachment[]>): NotificationItem[]` (thumbs com `id` = id do anexo de exemplo e `url: null`)
  - `useDemoFiles(attachments: DemoAttachment[], data: DashboardData | null): Map<string, DemoFile>` em `src/hooks/useDemoFiles.ts`
  - `useDemoNotifications(demo: DashboardData | null): NotificationsState`

Regras da demonstração (registrar no topo de `demoNotifications.ts`): quem recebe é a primeira pessoa **não líder** com mais tipos de aviso possíveis; o ator das atribuições e mudanças é o líder; os avisos de prazo só aparecem se essa pessoa tem de fato uma tarefa aberta com prazo na janela (nunca se inventa data). Atribuição e mudança aparecem sempre (só precisam de uma tarefa aberta).

- [ ] **Step 1: Testes**

`src/lib/demoNotifications.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DashboardData, DashboardTask } from "../types";
import { demoAvatarUrl } from "./demoAvatars";
import { demoAttachments } from "./demoBoard";
import { DEMO_PEOPLE, generateDemo } from "./demoData";
import { demoNotifications } from "./demoNotifications";
import { addDays } from "./metrics";

const today = "2026-10-07";
const task = (id: string, assigneeId: string, dueDay: string | null): DashboardTask => ({
  id,
  title: `Tarefa ${id}`,
  assigneeId,
  createdDay: "2026-09-01",
  dueDay,
  priority: null,
  labels: [],
  history: [{ day: "2026-09-01", to: "planned" }],
});

describe("demoAvatarUrl", () => {
  it("é uma imagem SVG reproduzível", () => {
    expect(demoAvatarUrl("demo-ana", "Ana Souza")).toMatch(/^data:image\/svg\+xml,/);
    expect(demoAvatarUrl("demo-ana", "Ana Souza")).toBe(demoAvatarUrl("demo-ana", "Ana Souza"));
  });
});

describe("DEMO_PEOPLE", () => {
  it("tem um líder, com foto, e gente com e sem foto", () => {
    expect(DEMO_PEOPLE.filter((p) => p.isLeader)).toHaveLength(1);
    expect(DEMO_PEOPLE.find((p) => p.isLeader)!.avatarUrl).toBeTruthy();
    expect(DEMO_PEOPLE.some((p) => !p.avatarUrl)).toBe(true);
  });
});

describe("demoNotifications", () => {
  const leader = DEMO_PEOPLE.find((p) => p.isLeader)!;
  const someone = DEMO_PEOPLE.find((p) => !p.isLeader)!;

  it("com prazos em todas as janelas, gera um item de cada tipo", () => {
    const d: DashboardData = {
      people: DEMO_PEOPLE,
      today,
      since: "2026-01-01",
      isDemo: true,
      tasks: [
        task("t1", someone.id, addDays(today, 3)),
        task("t2", someone.id, addDays(today, 1)),
        task("t3", someone.id, addDays(today, -1)),
        task("t4", someone.id, null),
      ],
    };
    const items = demoNotifications(d, new Map());
    expect(new Set(items.map((i) => i.kind))).toEqual(new Set(["assigned", "changed", "due_3d", "due_1d", "overdue"]));
    const assigned = items.find((i) => i.kind === "assigned")!;
    expect(assigned.actor?.id).toBe(leader.id);
    expect(assigned.fromLeader).toBe(true);
    expect(assigned.excerpt).not.toBe("");
    expect(items.some((i) => !i.read) && items.some((i) => i.read)).toBe(true);
    expect(items.every((i) => i.cardId === null)).toBe(true);
  });

  it("nunca inventa prazo: sem tarefa na janela, sem aviso daquele tipo", () => {
    const d: DashboardData = { people: DEMO_PEOPLE, today, since: "2026-01-01", isDemo: true, tasks: [task("t4", someone.id, null)] };
    const kinds = demoNotifications(d, new Map()).map((i) => i.kind);
    expect(kinds).toContain("assigned");
    expect(kinds).not.toContain("due_1d");
    expect(kinds).not.toContain("overdue");
  });

  it("na demonstração gerada, os avisos de prazo batem com as tarefas", () => {
    const d = generateDemo(42, { today: new Date("2026-10-07T12:00:00") });
    const items = demoNotifications(d, demoAttachments(d));
    expect(items.map((i) => i.kind)).toContain("assigned");
    // Títulos podem se repetir: basta existir uma tarefa com esse título e o prazo certo.
    for (const i of items.filter((x) => x.kind === "due_1d")) {
      expect(d.tasks.some((x) => x.title === i.cardTitle && x.dueDay === addDays(d.today, 1))).toBe(true);
    }
  });
});
```

Em `src/lib/demoData.test.ts:16`, `expect(data.people).toEqual(DEMO_PEOPLE);` continua valendo (mesmo objeto). Rode-o para garantir.

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run src/lib/demoNotifications.test.ts` → FAIL (módulos não existem).

- [ ] **Step 3: Fotos fictícias**

`src/lib/demoAvatars.ts`:

```ts
// Fotos da demonstração: um retrato ilustrado em SVG (fundo, ombros e cabeça), gerado a partir do
// id. Data URL síncrona e pura, sem canvas: roda nos testes e não sobe nada para o Storage.
// Cores de "foto", não de interface: tons de pele e fundos neutros, iguais nos dois temas.

const BACKGROUNDS = ["rgb(214 222 235)", "rgb(229 221 208)", "rgb(212 228 220)", "rgb(232 214 220)"];
const SKIN = ["rgb(241 205 176)", "rgb(198 145 108)", "rgb(140 94 66)", "rgb(224 178 142)"];
const SHIRTS = ["rgb(37 56 255)", "rgb(60 64 72)", "rgb(196 58 49)", "rgb(90 110 90)"];
const HAIR = ["rgb(40 30 24)", "rgb(112 72 40)", "rgb(20 20 20)", "rgb(160 120 70)"];

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function demoAvatarUrl(id: string, name: string): string {
  const h = hash(id);
  const pick = (list: string[], shift: number) => list[(h >>> shift) % list.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>${name} (foto fictícia)</title>` +
    `<rect width="64" height="64" fill="${pick(BACKGROUNDS, 0)}"/>` +
    `<path d="M10 64c2-14 11-20 22-20s20 6 22 20z" fill="${pick(SHIRTS, 4)}"/>` +
    `<circle cx="32" cy="27" r="13" fill="${pick(SKIN, 8)}"/>` +
    `<path d="M19 26c0-9 6-14 13-14s13 5 13 14c-3-5-8-7-13-7s-10 2-13 7z" fill="${pick(HAIR, 12)}"/>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
```

Em `src/lib/demoData.ts`:

```ts
import { demoAvatarUrl } from "./demoAvatars";

// Ana é a líder (coroa). Parte da equipe tem foto e parte fica com as iniciais, para mostrar os dois.
export const DEMO_PEOPLE: DashboardPerson[] = [
  { id: "demo-ana", name: "Ana Souza", isLeader: true, avatarUrl: demoAvatarUrl("demo-ana", "Ana Souza") },
  { id: "demo-bruno", name: "Bruno Lima" },
  { id: "demo-carla", name: "Carla Dias", avatarUrl: demoAvatarUrl("demo-carla", "Carla Dias") },
  { id: "demo-diego", name: "Diego Rocha" },
  { id: "demo-elisa", name: "Elisa Prado", avatarUrl: demoAvatarUrl("demo-elisa", "Elisa Prado") },
];
```

- [ ] **Step 4: Notificações fictícias**

`src/lib/demoNotifications.ts`:

```ts
// Notificações da demonstração, tiradas das próprias tarefas fictícias. Quem recebe é a pessoa não
// líder com mais avisos de prazo possíveis; quem atribui e muda é o líder. Avisos de prazo só para
// tarefas que de fato estão na janela (nunca se inventa data). Nada vai para o banco.
import type { DashboardData, DashboardPerson, DashboardTask, NotificationKind, NotificationPayload } from "../types";
import { DEMO_BOARD_NAME, type DemoAttachment } from "./demoBoard";
import { statusOn } from "./metrics";
import { daysBetween } from "./metrics";
import { notificationSentence, splitThumbs, type NotificationItem } from "./notifications";

const EXCERPT = "Pode assumir esta? Os arquivos de referência estão anexados. Qualquer dúvida, me chama.";

type DueKind = "due_3d" | "due_1d" | "overdue";

function dueKind(t: DashboardTask, today: string): DueKind | null {
  if (!t.dueDay) return null;
  const left = daysBetween(today, t.dueDay);
  if (left >= 2 && left <= 3) return "due_3d";
  if (left === 1) return "due_1d";
  if (left >= -3 && left <= -1) return "overdue";
  return null;
}

export function demoNotifications(d: DashboardData, attachments: Map<string, DemoAttachment[]>): NotificationItem[] {
  const leader = d.people.find((p) => p.isLeader);
  const openOf = (p: DashboardPerson) => d.tasks.filter((t) => t.assigneeId === p.id && statusOn(t, d.today) !== "done");
  const candidates = d.people.filter((p) => !p.isLeader && openOf(p).length > 0);
  if (!leader || candidates.length === 0) return [];
  const kindsOf = (p: DashboardPerson) => new Set(openOf(p).map((t) => dueKind(t, d.today)).filter(Boolean)).size;
  const me = candidates.reduce((best, p) => (kindsOf(p) > kindsOf(best) ? p : best));
  const open = openOf(me);

  const at = (hoursAgo: number) => new Date(new Date(`${d.today}T12:00:00`).getTime() - hoursAgo * 3_600_000).toISOString();
  const item = (
    id: string,
    kind: NotificationKind,
    t: DashboardTask,
    extra: Partial<NotificationPayload>,
    opts: { fromLeader: boolean; read: boolean; hoursAgo: number; withExcerpt?: boolean },
  ): NotificationItem => {
    const payload: NotificationPayload = {
      card_title: t.title,
      board_name: DEMO_BOARD_NAME,
      actor_name: opts.fromLeader ? leader.name : null,
      actor_was_leader: opts.fromLeader,
      due_date: t.dueDay,
      ...extra,
    };
    const split = splitThumbs(
      (attachments.get(t.id) ?? []).map((a) => ({ id: a.id, name: a.name, url: null, isImage: a.kind === "image" })),
    );
    return {
      id: `demo-${id}`,
      kind,
      read: opts.read,
      at: at(opts.hoursAgo),
      actor: opts.fromLeader ? { id: leader.id, name: leader.name, avatarUrl: leader.avatarUrl ?? null, isLeader: true } : null,
      fromLeader: opts.fromLeader,
      sentence: notificationSentence(kind, payload, d.today),
      cardTitle: t.title,
      boardName: DEMO_BOARD_NAME,
      excerpt: opts.withExcerpt ? EXCERPT : "",
      thumbs: split.thumbs,
      extraThumbs: split.extra,
      boardId: null,
      cardId: null,
    };
  };

  const items: NotificationItem[] = [];
  // Atribuição: de preferência uma tarefa com anexos de exemplo.
  const assignedTask = open.find((t) => attachments.has(t.id)) ?? open[0];
  items.push(item("assigned", "assigned", assignedTask, {}, { fromLeader: true, read: false, hoursAgo: 1, withExcerpt: true }));

  const seen = new Set<DueKind>();
  open.forEach((t, i) => {
    const kind = dueKind(t, d.today);
    if (!kind || seen.has(kind)) return;
    seen.add(kind);
    items.push(item(`${kind}-${i}`, kind, t, { days_left: t.dueDay ? daysBetween(d.today, t.dueDay) : undefined }, {
      fromLeader: false, read: false, hoursAgo: 4 + i,
    }));
  });

  const changedTask = open.find((t) => t !== assignedTask) ?? assignedTask;
  items.push(item("changed", "changed", changedTask, { changes: ["due_date", "attachments"], attachments: 2 }, {
    fromLeader: true, read: true, hoursAgo: 30,
  }));

  return items.sort((a, b) => b.at.localeCompare(a.at));
}
```

(Junte os dois imports de `./metrics` numa linha: `import { daysBetween, statusOn } from "./metrics";`. Confira em `src/lib/metrics.ts` que `statusOn(task, day)` existe e devolve `"planned" | "in_progress" | "done"`; `demoData.ts` já o importa.)

- [ ] **Step 5: Ver passar**

Run: `npx vitest run src/lib/demoNotifications.test.ts src/lib/demoData.test.ts` → PASS.

- [ ] **Step 6: Arquivos fictícios compartilhados**

Mova `useDemoFiles` de `DemoBoardView.tsx` (linhas ~151–170) para `src/hooks/useDemoFiles.ts`, mudando a assinatura para receber a lista de anexos e o `data` anulável:

```ts
import { useEffect, useState } from "react";
import type { DashboardData } from "../types";
import type { DemoAttachment } from "../lib/demoBoard";
import { makeDemoFiles, revokeDemoFiles, type DemoFile } from "../lib/demoFiles";

/** Cria os arquivos dos anexos de exemplo (URLs blob:) e os libera ao trocar de demonstração. */
export function useDemoFiles(attachments: DemoAttachment[], data: DashboardData | null): Map<string, DemoFile> {
  const [files, setFiles] = useState<Map<string, DemoFile>>(new Map());
  useEffect(() => {
    if (!data || attachments.length === 0) return setFiles(new Map());
    let current: Map<string, DemoFile> | null = null;
    let alive = true;
    const titleOf = (id: string) => data.tasks.find((t) => t.id === id)?.title ?? "";
    void makeDemoFiles(attachments, titleOf).then((made) => {
      if (!alive) return revokeDemoFiles(made);
      current = made;
      setFiles(made);
    });
    return () => {
      alive = false;
      if (current) revokeDemoFiles(current);
    };
  }, [attachments, data]);
  return files;
}
```

Em `DemoBoardView.tsx`, apague a função local e chame `useDemoFiles(useMemo(() => [...attachments.values()].flat(), [attachments]), data)` no lugar da chamada antiga (importe de `../../hooks/useDemoFiles` e remova os imports que sobrarem sem uso).

- [ ] **Step 7: Estado da demonstração**

Em `src/hooks/useNotifications.ts`, acrescente (importe `useState`, `useEffect`, `demoAttachments` de `../lib/demoBoard`, `demoNotifications` de `../lib/demoNotifications`, `useDemoFiles` de `./useDemoFiles`, `DashboardData` de `../types`):

```ts
/** Notificações fictícias da demonstração: ler e marcar mudam só a memória. */
export function useDemoNotifications(demo: DashboardData | null): NotificationsState {
  const attachments = useMemo(() => (demo ? demoAttachments(demo) : new Map()), [demo]);
  const base = useMemo(() => (demo ? demoNotifications(demo, attachments) : []), [demo, attachments]);
  // Só os arquivos que aparecem nas notificações.
  const shown = useMemo(() => {
    const ids = new Set(base.flatMap((i) => i.thumbs.map((t) => t.id)));
    return [...attachments.values()].flat().filter((a) => ids.has(a.id));
  }, [base, attachments]);
  const files = useDemoFiles(shown, demo);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  useEffect(() => setReadIds(new Set()), [demo]);

  const items = base.map((i) => ({
    ...i,
    read: i.read || readIds.has(i.id),
    thumbs: i.thumbs.map((t) => ({ ...t, url: files.get(t.id)?.url ?? null })),
  }));
  return {
    items,
    unread: items.filter((i) => !i.read).length,
    isError: false,
    markRead: (item) => setReadIds((s) => new Set(s).add(item.id)),
    markAllRead: () => setReadIds(new Set(items.map((i) => i.id))),
  };
}
```

Em `App.tsx`:

```tsx
  const teamNotifications = useTeamNotifications(team.id);
  const demoNotificationsState = useDemoNotifications(newDemo ? demo : null);
  const showDemo = Boolean(demo && newDemo);
  const notifications = showDemo ? demoNotificationsState : teamNotifications;
```

(substituindo `const notifications = useTeamNotifications(team.id);`), `isDemo={showDemo}` na `NotificationsView`, e no `onOpen`:

```tsx
          onOpen={(item) => {
            notifications.markRead(item);
            if (showDemo) return setView("board");
            if (item.cardId !== null && item.boardId !== null) {
              handleNavigate({ type: "card", id: item.cardId, title: item.cardTitle, board_id: item.boardId, board_name: item.boardName });
            }
          }}
```

- [ ] **Step 8: Verificar**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run test:e2e:mock
```

No navegador (dev): Dashboard → gerar demonstração. Ana aparece com foto e coroa na Carga da equipe e nos cards do board de exemplo; Bruno e Diego com iniciais. O sino mostra as não lidas da demonstração; a aba tem o aviso "Demonstração", a atribuição da Ana com "Pedido do líder", descrição e miniaturas, e os avisos de prazo que os dados permitirem. Sair da demonstração volta para as notificações reais.

- [ ] **Step 9: Commit**

```bash
git add src/lib/demoAvatars.ts src/lib/demoNotifications.ts src/lib/demoNotifications.test.ts src/lib/demoData.ts src/hooks/useDemoFiles.ts src/hooks/useNotifications.ts src/components/board/DemoBoardView.tsx src/App.tsx
git commit -m "Demonstração: líder com foto, fotos fictícias e notificações de exemplo"
```

---

### Task 10: Documentação e conferência final

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-07-lider-e-notificacoes-design.md` (registrar a janela do atraso e a regra da demonstração)

- [ ] **Step 1: CLAUDE.md**

Em "Convenções", depois do item de Permissões, acrescente:

```markdown
- Líder (`team_member.is_leader`, `0016`): um selo, não um papel — permissão continua sendo só o `role`. Só o admin dá ou tira a coroa (tela Equipe); leitor não é líder. A coroa (`IconCrown`, `text-highlight`) sai do próprio `Avatar` (`leader`), que também mostra a foto (`avatarUrl`) ou, sem ela, as iniciais.
- Foto de perfil (`profile.avatar_path`, `0016`): bucket **público** `avatars`, em `<user_id>/<uuid>.<ext>`, cada um grava e apaga só na própria pasta (`avatar_path_is_mine`). O navegador recorta e reduz para 256×256 antes de enviar (`src/lib/avatarImage.ts`); acesso em `src/db/avatars.ts`. A auditoria aceita esse bucket público de propósito.
- Notificações (`notification`, `0017`; spec `docs/superpowers/specs/2026-10-07-lider-e-notificacoes-design.md`): só o banco cria — triggers em `card`/`card_attachment` (`assigned`, `changed`, agrupada enquanto não lida) e `notify_due_for_card`/`notify_due_dates` (`due_3d`, `due_1d`, `overdue`, uma vez por card e prazo; job `pg_cron` às 11:00 UTC, que também apaga lidas há mais de 90 dias). O cliente só lê e marca `read_at`. Na tela, tudo vira `NotificationItem` (`src/lib/notifications.ts`), do banco (`useTeamNotifications`) ou da demonstração (`useDemoNotifications`), e a mesma `NotificationsView` mostra os dois. Realtime pelo canal da pessoa (`user_id=eq.`).
```

No item do `AppMenu`, acrescente **Notificações** antes de Minhas tarefas, e no "Modelo de dados":

```markdown
- `notification(id, user_id, team_id, board_id, card_id, actor_id, kind, due_key, payload jsonb, created_at, updated_at, read_at)` — só o banco cria; cada um lê e marca as suas
```

e acrescente `is_leader` em `team_member(...)` e `avatar_path` em `profile(...)`.

- [ ] **Step 2: Spec**

Na seção "Quem gera", no item de avisos de prazo, acrescente: "`overdue` só para prazos vencidos há 1 a 3 dias: sai no dia seguinte e tolera o job falhar, sem despejar avisos de cards vencidos há meses." Na seção 4, troque "ao menos um item de cada tipo" por "atribuição e mudança sempre; avisos de prazo só quando a pessoa tem tarefa naquela janela (nunca se inventa data)".

- [ ] **Step 3: Conferência completa**

```bash
npm test
npm run lint
npm run build
npm run test:e2e:mock
npx supabase db reset
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node scripts/test-db.mjs
npm run gen:setup && git diff --exit-code -- supabase/setup_producao.sql
```

Esperado: tudo verde e o `git diff` vazio.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-07-lider-e-notificacoes-design.md
git commit -m "Docs: líder, foto de perfil e notificações"
```

Antes do merge (fora deste plano, com o usuário): no painel do Supabase de **produção**, conferir que a extensão `pg_cron` pode ser ligada (Database → Extensions) — o workflow `Deploy do banco` aplica a 0017, e o bloco `do $do$` só agenda se a extensão existir. Depois do deploy, `select * from cron.job;` no prod deve listar `tododay-avisos-de-prazo`, e `npm run check:prod` deve passar com o bucket `avatars` e a tabela `notification`.
