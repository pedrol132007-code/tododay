# Migração para Supabase (uso em equipe)

Objetivo: mandar um link para alguém não técnico, que abre no navegador, cria a senha e já vê os boards da equipe.

## Decisões

- Supabase (Postgres + Auth + Realtime), app online (offline-first deixa de existir).
- Versão web na Vercel; o desktop Tauri continua funcionando como opção.
- IDs `bigint` (os tipos TS continuam `number`).
- Começar do zero: sem importar o `kanban.db` local.
- Cadastro livre com confirmação de e-mail obrigatória. Entrar numa equipe **só por convite do admin**; sem equipe, o usuário vê um estado vazio ("peça um convite ou crie sua equipe").
- Qualquer usuário pode criar uma equipe e vira admin dela.
- Equipe → boards → colunas → cards. Acesso definido **na equipe inteira** (não por board).
- Cada membro tem permissão fixa (`admin` / `member` / `viewer`) + cargo em texto livre (`job_title`, só exibição, definido pelo admin).
- Convite **por link** (decidido na E6, no lugar do convite por e-mail): o admin gera um link com papel e cargo, de **uso único**, válido por 7 dias e cancelável. Quem abre cria a conta (confirmando o e-mail) ou entra, e aceita. Sem Edge Function: aceitar é a função `accept_invite()` no banco.
- Não é possível remover/rebaixar o último admin de uma equipe.
- SMTP: Gmail dedicado com senha de app.
- Dois projetos Supabase na mesma organização: `tododay-dev` e `tododay-prod`. A chave `service_role` nunca vai para o frontend (hoje nada a usa).

## Modelo novo

- `profile(id → auth.users, ...)` — criado por trigger no cadastro
- `team(id, name, created_by, created_at)`
- `team_member(team_id, user_id, role, job_title, joined_at)`
- `team_invite(id, team_id, token, label, role, job_title, created_by, created_at, expires_at, used_by, used_at, revoked_at)` — link de uso único
- `board.team_id`; `card.board_id` desnormalizado por trigger (filtro do Realtime)
- `card.assignee_id → profile` (precisa ser membro da equipe)
- `activity(team_id, board_id, card_id, actor_id, action, payload jsonb, created_at)` — preenchida por triggers
- RLS em todas as tabelas via `team_role(team_id)`

## Etapas

| # | Etapa | Teste |
|---|---|---|
| E1 | Projeto dev, `.env`, cliente `src/db/supabase.ts` ao lado do SQLite | Chamada ao Supabase responde; app igual |
| E2 | Cadastro/login/logout, `profile`, telas "Definir senha" e "Esqueci minha senha" | Cadastrar, confirmar e-mail, entrar, sair, sessão persiste |
| E3 | Schema Postgres + `team`, `team_member`, `board.team_id`, RLS | Script SQL com admin/membro/leitor/estranho; último admin protegido |
| E4 | `src/db/*` → Supabase (mesmas assinaturas), RPCs de mover, seletor de equipe, busca por equipe | Roteiro manual das Fases 2–5 + `npm test`, no navegador |
| E6 | Tela da equipe, convite por link, cargo, leitor sem controles de edição, SMTP Gmail no dev | Contas `+teste`: link → criar conta → boards; link usado/cancelado não vale; membro não convida |
| E7 | Realtime por board → invalidar queries | Duas janelas, contas diferentes |
| E8 | Responsável nos cards | Atribuir; remover da equipe desatribui |
| E9 | Histórico de atividade (cards e equipe) | Entradas com autor certo |
| E10 | Remover `plugin-sql`, atualizar CLAUDE.md e README | `npm run tauri build` |
| E11 | Deploy Vercel + Supabase prod, `vercel.json` (SPA), Site URL/Redirect URLs, templates em PT | Janela anônima: link de convite → criar conta → confirmar e-mail → ver o board |

(E5 — importar dados locais — foi descartada.)
