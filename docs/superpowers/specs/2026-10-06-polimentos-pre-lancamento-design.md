# Polimentos antes do lançamento — design

Data: 2026-10-06 · Aprovado na conversa, aguardando revisão desta spec.

## Objetivo

Antes de convidar a equipe do piloto, três coisas que deixam o uso diário melhor:

1. **Meu perfil:** cada pessoa corrige o próprio nome e troca a senha sem depender do "esqueci
   minha senha".
2. **Minhas tarefas:** uma tela com tudo o que está com a pessoa, em todos os boards da equipe,
   por prazo.
3. **Boas-vindas:** na primeira entrada, um painel curto com o que dá para fazer e onde.

**Sucesso:** a pessoa entra, entende em 30 segundos onde ficam os cards, as tarefas dela e o perfil;
corrige o nome se o convite trouxe errado; acha num lugar só o que está atrasado com ela.

## Decisões

| Pergunta | Escolha |
|---|---|
| Perfil | Só nome e senha. Cor escolhida e foto ficam para depois do piloto |
| Onde fica Minhas tarefas | Primeiro item do menu da pessoa (canto superior direito), tela própria com Voltar; abas e tela inicial não mudam |
| Boas-vindas lembradas onde | localStorage (`tododay.welcomed`), uma vez por navegador, como tema e densidade |

Nenhuma migration: a RLS de `profile` já deixa cada um atualizar o próprio `display_name`
(`0001_profile.sql`).

## 1. Meu perfil — seção "Perfil" no topo de Configurações

- **Nome:** campo com o `display_name` atual e botão Salvar → `update profile set display_name`
  do próprio id (função em `src/db/`). O nome é aparado (trim); vazio não salva (botão
  desabilitado) e acima de 80 caracteres também não. Depois de salvar, invalida o perfil e os
  membros da equipe no React Query: o menu, os avatares e o filtro "Eu" mostram o nome novo. A
  atividade antiga continua com o nome da época (o `payload` guarda nomes).
- **Senha:** "Nova senha" e "Confirmar senha", mínimo de 8 (o mesmo do Auth), as duas iguais; botão
  "Trocar senha" → `supabase.auth.updateUser({ password })` (já existe em `src/db/auth.ts`,
  usado na recuperação). Erros do Supabase em português: senha fraca, igual à atual, ou sessão
  antiga que exige entrar de novo ("Por segurança, saia e entre de novo para trocar a senha").
  Sucesso: toast "Senha trocada" e os campos limpos.
- **E-mail:** mostrado, só leitura.
- Validação de nome e senha numa função pura (`src/lib/profileRules.ts`), testada no Vitest.

## 2. Minhas tarefas — `src/components/my-tasks/`

- **Entrada:** item "Minhas tarefas" no `AppMenu`, acima de Equipe; nova `AppView` `"my-tasks"`,
  tela com `PageHeader` ("Minhas tarefas", Voltar → board), como Equipe e Configurações.
- **Dados** (`src/db/`): cards da equipe atual com `assignee_id = eu`, `archived_at is null`, numa
  coluna com `status <> 'done'`, com `board(name)` e `list(name, status)`. RLS já limita à equipe.
- **Agrupamento** (`src/lib/myTasks.ts`, puro, testado): pelo `due_date` comparado com o dia local
  (`localDay`, o mesmo do selo de prazo):
  - **Atrasadas** (antes de hoje), **Hoje**, **Esta semana** (amanhã até domingo desta semana),
    **Depois**, **Sem prazo**.
  - Dentro de cada grupo: prazo crescente, depois prioridade (urgente → baixa → sem), depois
    título. Grupos vazios não aparecem.
- **Linha:** título, "Board › Coluna", selo de prazo (`DueBadge`) e prioridade, como na face do
  card. Clicar abre o board com `?card=<id>` (o mesmo caminho do dashboard).
- **Vazio:** "Nada atribuído a você agora."
- **Atualização:** a consulta recarrega ao abrir a tela (React Query, `refetchOnMount`); não assina
  o Realtime de todos os boards.

## 3. Boas-vindas — `src/components/ui/WelcomeDialog.tsx`

- Aparece na primeira vez que a pessoa está dentro de uma equipe num navegador
  (`tododay.welcomed` ausente). Fechar de qualquer jeito (Começar, Ver minhas tarefas, Esc) grava
  a chave. Erro no localStorage: não aparece (nunca bloqueia a entrada).
- Painel modal pequeno, com tokens de cor e `.btn-primary`. Título: "Bem-vindo ao Tododay,
  {primeiro nome}". Quatro dicas com ícone:
  1. **Cards:** crie na coluna, arraste ou use *Mover para…*; clique no card para prazo,
     responsável, checklist e anexos.
  2. **Minhas tarefas:** no menu com seu nome, tudo o que está com você, por prazo.
  3. **Busca:** *Ctrl+K* procura em todos os boards; */* filtra o board aberto; o filtro *Eu* mostra
     só os seus.
  4. Membro/viewer: **Perfil** — confira seu nome e troque a senha em *Configurações*. Admin:
     **Equipe** — convide pelo menu *Equipe*; se o e-mail não chegar, *Gerar link de acesso*.
- Botões: "Ver minhas tarefas" (secundário: fecha e abre a tela) e **"Começar"** (principal).
- Não aparece na demonstração do dev? Aparece igual: é por pessoa, não por board.

## Testes

- Vitest: `myTasks.test.ts` (grupos nas bordas: ontem, hoje, domingo, segunda seguinte, sem prazo;
  ordenação), `profileRules.test.ts` (nome vazio/espaços/longo, senha curta/diferente).
- Playwright simulado (`e2e/layout.spec.ts`): boas-vindas aparecem uma vez e somem depois de
  fechar; versão admin × membro; Minhas tarefas mostra os grupos e o clique abre o card; salvar
  o nome atualiza o menu.
- Contra o dev: trocar a senha de verdade com a conta E2E (e voltar a senha original).

## Fora de escopo

Cor/foto do avatar; tour passo a passo; "rever boas-vindas"; Minhas tarefas em tempo real ou de
todas as equipes; notificações.
