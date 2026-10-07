# Líder, foto de perfil e notificações — design

Data: 2026-10-07 · Aprovado na conversa; aguardando revisão da spec escrita.

## Objetivo

1. Marcar quem é **líder** na equipe, com uma coroa visível onde a pessoa aparece.
2. Cada pessoa pode ter uma **foto de perfil**, mostrada no lugar das iniciais.
3. Uma aba **Notificações** avisa a pessoa do que é dela: card atribuído (com descrição, anexos e a
   foto de quem atribuiu, destacado quando foi um líder), card atrasado, card que vence amanhã e
   mudanças que outra pessoa fez num card dela.

**Sucesso:** o líder atribui um card com descrição e anexos a alguém; essa pessoa vê o sino com o
contador subir em tempo real, abre a aba, vê a foto do líder com a coroa, a descrição e as
miniaturas, clica e cai no card. No dia seguinte ao prazo, recebe "Atrasou" sem ninguém fazer nada.
Tudo isso também aparece na demonstração do dev, sem banco.

## Decisões

- O líder é um **selo**, não um papel. O papel (`admin` / `member` / `viewer`) continua sendo a
  única coisa que decide permissão. Pode haver mais de um líder por equipe.
- "O líder posta algo para alguém" = **atribuir um card**. Descrição e anexos são os do próprio
  card; não existe recado avulso.
- "Mudaram meu card" é filtrado e agrupado para não virar barulho (seção 3).
- Foto por upload no Perfil, num bucket público pequeno.
- Fora do escopo: e-mail, notificação do sistema operacional/navegador, preferências de quais tipos
  receber, apagar notificação (só marcar como lida), recado avulso.

## 1. Líder

### Banco (`0016_leader_and_avatar.sql`)

- `team_member.is_leader boolean not null default false`.
- Só o **admin** da equipe muda `is_leader`: `grant update (is_leader)` para `authenticated`; a
  policy `team_member_update` (`0003`) já só deixa admin atualizar.
- O trigger de atividade de `team_member` (`0009`) passa a registrar `member.leader_on` /
  `member.leader_off`.
- `check (not (is_leader and role = 'viewer'))`: leitor não é líder. Rebaixar um líder a leitor
  exige tirar a coroa antes (a UI faz as duas coisas juntas).

### Interface

- Tela Equipe: botão "Tornar líder" / "Tirar coroa" por pessoa, só para admin. Ao lado do cargo,
  "Líder" com a coroa.
- `Avatar` ganha `leader?: boolean`: uma coroa pequena (ícone SVG próprio) no canto superior,
  cor `highlight`, com `title` "Líder". Aparece em todo lugar onde o `Avatar` já é usado (card,
  painel do card, Equipe, Carga da equipe, notificações).
- Os dados de membro já carregados (`TeamMemberWithProfile`) passam a trazer `is_leader`; os
  componentes pegam a informação de lá, sem consulta nova.

## 2. Foto de perfil

### Banco e Storage (mesma `0016`)

- `profile.avatar_path text null`; `grant update (display_name, avatar_path)` ao `authenticated`
  (a policy `profile_update_own` já restringe à própria linha).
- Bucket **público** `avatars`, limite 2 MB, só `image/webp`, `image/png`, `image/jpeg`. Caminho
  `<user_id>/<uuid>.webp`. Policies de `storage.objects`: inserir e apagar só na própria pasta
  (`(storage.foldername(name))[1] = auth.uid()::text`). Leitura pública (URL fixa, sem assinatura,
  cacheável). Os nomes de arquivo são UUIDs, então ninguém lista fotos de quem não conhece.
- Trocar foto: envia a nova, grava `avatar_path`, apaga a antiga. Remover: limpa `avatar_path` e
  apaga o arquivo.

### Interface

- Configurações → Perfil: "Trocar foto" e "Remover foto". O navegador recorta o centro em
  quadrado e reduz para 256×256 WebP (canvas) antes de enviar.
- `Avatar` ganha `avatarUrl?: string | null`: com URL, mostra a imagem redonda (com `alt` = nome);
  sem URL ou se a imagem falhar ao carregar, as iniciais coloridas de hoje.
- Acesso ao Storage fica em `src/db/profile.ts` (ou no arquivo de perfil que já existir), nunca no
  componente.

## 3. Notificações

### Tabela (`0017_notifications.sql`)

```
notification(
  id bigint identity,
  user_id uuid not null -> profile(id) on delete cascade,   -- quem recebe
  team_id bigint not null -> team on delete cascade,
  board_id bigint null -> board on delete set null,
  card_id bigint null -> card on delete set null,
  actor_id uuid null -> profile(id) on delete set null,     -- quem fez (null = sistema)
  kind text not null check (kind in ('assigned','overdue','due_soon','changed')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz null
)
```

- `payload` traz tudo o que a lista precisa mostrar, com os valores da época: `card_title`,
  `board_name`, `actor_name`, `actor_was_leader`, `due_date`, e em `changed` a lista
  `changes` (ex.: `["due_date","description","list","attachments:2"]`) e `list_name` quando moveu.
- Coluna `due_key date null` (o prazo que gerou o aviso) e índice único parcial
  `(user_id, card_id, kind, due_key) where kind in ('overdue','due_soon')`: uma só por card, tipo e
  prazo. Mudou o prazo, pode avisar de novo.
- Índice `(user_id, read_at, updated_at desc)` para a lista e o contador.
- RLS: `select` e `update (read_at)` só onde `user_id = auth.uid()`. Sem `insert`/`delete` pelo
  cliente; quem insere são funções `security definer`.
- Realtime: tabela na publicação; o cliente assina com filtro `user_id=eq.<id>`.

### Quem gera

Regra comum: não notifica quem fez a ação (`actor_id = user_id`), nem card arquivado, nem
responsável desativado (`team_member.deactivated_at`) ou leitor.

- **`assigned`** — trigger `after update of assignee_id` (e `after insert` com responsável) em
  `card`, quando o novo responsável é outra pessoa.
- **`changed`** — triggers em `card` (mudança de `due_date`, `description`, `list_id`) e em
  `card_attachment` (insert), quando quem mudou não é o responsável. Se já existe notificação
  `changed` **não lida** desse card para essa pessoa, ela é atualizada: junta `changes` (somando
  anexos), troca `actor_*` pelo mais recente e sobe `updated_at`. Senão, cria outra.
  Mudança dentro de 1 minuto depois de um `assigned` não lido do mesmo card é absorvida (quem
  atribui costuma ajeitar o prazo em seguida).
- **`overdue`** e **`due_soon`** — função `notify_due_dates()` rodada pelo `pg_cron` todo dia às
  11:00 UTC (8h de Brasília): cards abertos, não arquivados, com responsável, com prazo
  `< hoje` (`overdue`) ou `= amanhã` (`due_soon`), em coluna que não é de concluídos. O índice
  único garante uma só. "Hoje" no fuso `America/Sao_Paulo`.
- O ator é lido de `auth.uid()` dentro do trigger; quando nulo (job), `actor_id` fica nulo e a UI
  mostra o ícone do Tododay em vez de um avatar.

### Cliente

- `src/db/notifications.ts`: listar (últimas 100 da equipe atual), contar não lidas, marcar uma,
  marcar todas, URLs assinadas das miniaturas (reaproveita `src/db/attachments.ts`).
- `src/lib/notificationText.ts` (pura, com teste): frase de cada item ("Ana atribuiu a você",
  "Atrasou há 2 dias", "Vence amanhã", "Ana mudou o prazo e anexou 2 arquivos").
- `useNotifications` (React Query) + assinatura Realtime por usuário em `src/db/realtime.ts`, que só
  invalida as queries.

### Interface

- Sino no topo, ao lado do menu, com contador de não lidas (fundo `danger`, número sempre escrito;
  "9+" acima de 9). Clique abre a `view` `notifications` (como Minhas tarefas). Também entra no
  `AppMenu`.
- Item: avatar de quem fez (foto ou iniciais, coroa se `actor_was_leader`), frase, título do card e
  nome do board, até 2 linhas da descrição atual do card, miniaturas dos anexos (no máximo 4, o
  resto como "+N"), data relativa. Não lida: fundo `bg-elevated` e um ponto `primary`. De líder:
  rótulo "Pedido do líder".
- Clicar abre o board com `?card=<id>` e marca como lida. Card apagado: o item fica, sem link.
- Filtros: Todas · Não lidas · Do líder. Botão "Marcar todas como lidas".
- Leitor também vê o sino e a aba; como não recebe cards, ela fica vazia ("Nenhuma notificação").

## 4. Demonstração (só fora de produção)

- `demoData.ts`: uma ou duas pessoas fictícias com `is_leader`; parte delas com foto desenhada no
  navegador (`demoFiles.ts`, canvas → URL `blob:`), as outras com iniciais.
- `src/lib/demoNotifications.ts`: gera, a partir dos cards da própria demo, ao menos um item de
  cada tipo (atribuição pelo líder com descrição e anexos de exemplo, atraso, vence amanhã,
  mudança agrupada), parte lida e parte não. Nada vai para o banco ou o Storage.
- Enquanto a demonstração existe, o sino e a aba mostram essas notificações; marcar como lida muda
  só o estado em memória.

## 5. Testes

- SQL (`supabase/tests/0016_*_test.sql`, `0017_*_test.sql`), no padrão de bloco `DO` que sempre
  termina em erro:
  - só admin muda `is_leader`; leitor não pode ser líder; cada um só muda o próprio `avatar_path`
    e só grava na própria pasta do bucket.
  - cada pessoa só lê e marca as próprias notificações; cliente não insere.
  - `assigned` gerado ao atribuir a outro e não ao atribuir a si mesmo; `changed` agrupa enquanto
    não lida e cria nova depois de lida; `notify_due_dates()` rodada duas vezes gera uma só;
    arquivado, desativado e leitor não recebem.
- Vitest: `notificationText`, agrupamento/limite de miniaturas, `demoNotifications` (um de cada
  tipo).
- e2e simulado (`e2e/mockSession.ts`): sino com contador, aba com filtros, clique abre o card.
- `npm run gen:setup` regerado; `check:prod` passa a conferir o bucket `avatars` e a tabela
  `notification` automaticamente (já lê das migrations).

## Riscos

- **`pg_cron`**: precisa da extensão ligada no dev e no prod (a migration faz
  `create extension if not exists pg_cron`) e o Postgres do CI (`supabase db start`) precisa
  aceitar. Se o CI não tiver, o teste chama `notify_due_dates()` direto e o agendamento fica num
  bloco que só roda quando a extensão existe.
- Volume: o mesmo job diário apaga notificações lidas há mais de 90 dias, para a tabela não
  crescer sem limite.
