# Polimentos antes do lançamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meu perfil (nome e senha), Minhas tarefas (cards atribuídos a mim, por prazo) e um painel de boas-vindas no primeiro acesso.

**Architecture:** Regras puras em `src/lib/` (validação do perfil, agrupamento das tarefas), acesso ao Supabase em `src/db/`, telas novas no mesmo padrão de Equipe/Configurações (`PageHeader` + Voltar), item novo no `AppMenu` e um diálogo no `TeamWorkspace`. Sem migration.

**Tech Stack:** React 18 + TS, React Query, Supabase JS, Tailwind (tokens), Vitest, Playwright (simulado e contra o dev).

**Spec:** `docs/superpowers/specs/2026-10-06-polimentos-pre-lancamento-design.md`

## Global Constraints

- Nenhuma migration; nome via `update profile set display_name` (RLS `profile_update_own` + `grant update (display_name)` da `0001`).
- Supabase só em `src/db/*.ts`; componentes usam hooks.
- Cores só pelos tokens; ação principal com `.btn-primary`; textos em PT.
- Nome: trim, 1–80 caracteres. Senha: mínimo 8, as duas iguais.
- "Hoje" = `localDay(new Date())` de `src/lib/dashboardRules.ts` (o mesmo do selo de prazo). "Esta semana" = amanhã até domingo desta semana.
- Ordem dentro do grupo: prazo ↑, prioridade (urgent → high → medium → low → sem), título.
- Boas-vindas: chave `tododay.welcomed` no localStorage; erro no localStorage = não mostra.
- Commits pequenos em PT terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Testes de ponta a ponta existentes com o painel de boas-vindas aberto** → o painel cobre a tela e todos os testes quebram. Esperado: os testes antigos rodam como antes. Coberto na Task 4 (sessão simulada e `signIn` do `app.spec.ts` marcam `tododay.welcomed`).
2. **Domingo e virada de semana** → tarefa de segunda cai em "Esta semana" num domingo. Esperado: no domingo, "Esta semana" fica vazia e segunda vai para "Depois". Coberto na Task 2.
3. **Nome com espaços nas pontas ou só espaços** → salva " " ou "Ana  ". Esperado: trim; só espaços não salva. Coberto na Task 1.
4. **Troca de senha com sessão antiga** (Supabase pede reautenticação) → erro em inglês. Esperado: "Por segurança, saia e entre de novo para trocar a senha." Coberto na Task 1 (mensagem no mapa de `src/db/auth.ts`).
5. **Card atribuído a mim em coluna "done" ou arquivado** → aparece em Minhas tarefas. Esperado: não aparece. Coberto na Task 3 (filtros na consulta, conferidos no teste pelo pedido feito ao Supabase).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/profileRules.ts` (+ `.test.ts`) | `nameError`, `passwordError` |
| `src/db/auth.ts` | `updateDisplayName`; mensagem de reautenticação |
| `src/hooks/useAuth.ts` | `useUpdateDisplayName`, `useUpdatePassword` |
| `src/components/settings/ProfileSection.tsx` | Seção "Perfil" (nome, e-mail, senha) |
| `src/components/settings/SettingsView.tsx` | Recebe `userId`, mostra `ProfileSection` no topo |
| `src/lib/myTasks.ts` (+ `.test.ts`) | `groupMyTasks` |
| `src/db/myTasks.ts` | `listMyTasks`, tipo `MyTask` |
| `src/hooks/useMyTasks.ts` | `useMyTasks` |
| `src/components/my-tasks/MyTasksView.tsx` | Tela Minhas tarefas |
| `src/components/ui/AppMenu.tsx` | Item "Minhas tarefas"; `AppView` ganha `"my-tasks"` |
| `src/components/ui/WelcomeDialog.tsx` | Painel de boas-vindas + `shouldWelcome`/`markWelcomed` |
| `src/App.tsx` | Liga a tela nova, o diálogo e o `userId` nas Configurações |
| `e2e/mockSession.ts`, `e2e/app.spec.ts`, `e2e/layout.spec.ts` | `tododay.welcomed`; testes novos |

---

### Task 1: Meu perfil (nome e senha)

**Files:** Create `src/lib/profileRules.ts`, `src/lib/profileRules.test.ts`, `src/components/settings/ProfileSection.tsx`. Modify `src/db/auth.ts`, `src/hooks/useAuth.ts`, `src/components/settings/SettingsView.tsx`, `src/App.tsx` (passar `userId`), `e2e/layout.spec.ts`.

**Interfaces:**
- Produces: `nameError(raw: string): string | null`, `passwordError(password: string, confirm: string): string | null`, `NAME_MAX = 80`, `PASSWORD_MIN = 8`; `updateDisplayName(userId: string, name: string): Promise<void>`; `useUpdateDisplayName(userId)`, `useUpdatePassword()`; `SettingsView({ userId, onBack })`.

- [ ] **Step 1: Teste das regras**

`src/lib/profileRules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nameError, passwordError } from "./profileRules";

describe("nome do perfil", () => {
  it("aceita nome normal e ignora espaços nas pontas", () => {
    expect(nameError("Ana Souza")).toBeNull();
    expect(nameError("  Ana  ")).toBeNull();
  });
  it("vazio ou só espaços não salva", () => {
    expect(nameError("")).toBe("Digite seu nome.");
    expect(nameError("   ")).toBe("Digite seu nome.");
  });
  it("mais de 80 caracteres não salva (contando depois do trim)", () => {
    expect(nameError("a".repeat(80))).toBeNull();
    expect(nameError(` ${"a".repeat(80)} `)).toBeNull();
    expect(nameError("a".repeat(81))).toBe("Use no máximo 80 caracteres.");
  });
});

describe("nova senha", () => {
  it("pelo menos 8 caracteres e as duas iguais", () => {
    expect(passwordError("12345678", "12345678")).toBeNull();
    expect(passwordError("1234567", "1234567")).toBe("Use pelo menos 8 caracteres.");
    expect(passwordError("12345678", "12345679")).toBe("As senhas não conferem.");
  });
});
```

Run `npx vitest run src/lib/profileRules.test.ts` → FAIL (módulo não existe).

- [ ] **Step 2: Implementar as regras**

```ts
// Regras da seção Perfil (Configurações). O mínimo da senha é o mesmo do Auth (npm run auth:configurar).
export const NAME_MAX = 80;
export const PASSWORD_MIN = 8;

export function nameError(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "Digite seu nome.";
  if (name.length > NAME_MAX) return `Use no máximo ${NAME_MAX} caracteres.`;
  return null;
}

export function passwordError(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use pelo menos ${PASSWORD_MIN} caracteres.`;
  if (password !== confirm) return "As senhas não conferem.";
  return null;
}
```

Run → PASS.

- [ ] **Step 3: Banco e hooks**

Em `src/db/auth.ts`, no mapa `messages`, acrescente:
```ts
  reauthentication_needed: "Por segurança, saia e entre de novo para trocar a senha.",
```
e depois de `getMyProfile`:
```ts
export async function updateDisplayName(userId: string, name: string): Promise<void> {
  const { error } = await supabase.from("profile").update({ display_name: name.trim() }).eq("id", userId);
  if (error) throw error;
}
```
Em `src/hooks/useAuth.ts`:
```ts
export function useUpdateDisplayName(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => updateDisplayName(userId, name),
    // O nome aparece no menu (profile) e em avatares, filtros e responsáveis (teamMembers).
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
    },
  });
}

export function useUpdatePassword() {
  return useMutation({ mutationFn: (password: string) => updatePassword(password) });
}
```
(imports `useMutation`, `useQueryClient`, `updateDisplayName`, `updatePassword`.)

- [ ] **Step 4: `ProfileSection`**

`src/components/settings/ProfileSection.tsx`: recebe `userId`; usa `useProfile`, `useUpdateDisplayName`, `useUpdatePassword`, `useToast`. Conteúdo:
- "Nome": `<input aria-label="Nome">` iniciado com `profile.display_name` (estado local, ressincroniza quando o perfil muda); botão "Salvar" (`.btn-primary px-4 py-2`) desabilitado quando `nameError(value)` ou quando `value.trim() === profile.display_name`; o erro de `nameError` aparece abaixo em `text-danger text-xs` só se o campo não está vazio-inicial. Sucesso: toast "Nome salvo".
- "E-mail": texto `profile.email` em `text-text-muted`.
- "Trocar senha": `<input type="password" aria-label="Nova senha" autoComplete="new-password">` e `aria-label="Confirmar senha"`; botão "Trocar senha" (`.btn-primary`) desabilitado com `passwordError` ≠ null; erro do Supabase (`AuthFailure.message`) em `text-danger text-xs`; sucesso: toast "Senha trocada" e campos limpos.
- Estrutura visual: use os componentes `Section`/`Row` de `SettingsView.tsx` (exporte-os de lá) e as classes de input do `DeleteBoardDialog` (`rounded-lg border border-border bg-bg-elevated px-3 py-2 text-text-primary outline-none focus:border-primary`).

- [ ] **Step 5: Ligar**

`SettingsView({ userId, onBack })`: `<ProfileSection userId={userId} />` antes de "Aparência". Em `src/App.tsx`: `<SettingsView userId={userId} onBack={() => setView("board")} />`. Em "Sobre", troque o texto por "Tema e densidade ficam salvos só neste navegador ou computador; o nome vale em todo lugar."

- [ ] **Step 6: Teste de ponta a ponta (simulado)**

Em `e2e/layout.spec.ts`:
```ts
test("perfil: salvar o nome manda só o nome aparado e o menu mostra o novo", async ({ page }) => {
  await openLongBoard(page);
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("menuitem", { name: "Configurações" }).click();
  const name = page.getByLabel("Nome");
  await expect(name).toHaveValue("E2E");
  await name.fill("  Ana Souza  ");
  const saved = page.waitForRequest((r) => r.method() === "PATCH" && r.url().includes("/rest/v1/profile"));
  await page.getByRole("button", { name: "Salvar" }).click();
  expect((await saved).postDataJSON()).toEqual({ display_name: "Ana Souza" });
  await expect(page.getByText("Nome salvo")).toBeVisible();
  await name.fill("   ");
  await expect(page.getByRole("button", { name: "Salvar" })).toBeDisabled();
});
```
Run `npx playwright test -c playwright.mock.config.ts -g "perfil"` → PASS (antes do Step 4/5 ele falha; rode-o primeiro para ver o FAIL).

- [ ] **Step 7: Verificar e commit**

`npx tsc --noEmit -p . && npm run lint && npm test` verdes.
```bash
git add src/lib/profileRules.ts src/lib/profileRules.test.ts src/db/auth.ts src/hooks/useAuth.ts src/components/settings src/App.tsx e2e/layout.spec.ts
git commit -m "Meu perfil: editar o nome e trocar a senha em Configurações"
```

---

### Task 2: Agrupamento de Minhas tarefas (função pura)

**Files:** Create `src/lib/myTasks.ts`, `src/lib/myTasks.test.ts`.

**Interfaces:**
- Consumes: `daysBetween` de `src/lib/metrics.ts`; `PRIORITIES` de `src/lib/boardVisuals.ts`; `CardPriority`.
- Produces: `type MyTaskGroupId = "overdue" | "today" | "week" | "later" | "none"`; `groupMyTasks<T extends { due_date: string | null; priority: CardPriority | null; title: string }>(tasks: T[], today: string): { id: MyTaskGroupId; label: string; tasks: T[] }[]` (só grupos com tarefas, na ordem Atrasadas, Hoje, Esta semana, Depois, Sem prazo).

- [ ] **Step 1: Testes**

```ts
import { describe, expect, it } from "vitest";
import { groupMyTasks } from "./myTasks";

const t = (title: string, due_date: string | null, priority: "urgent" | "high" | "medium" | "low" | null = null) => ({ title, due_date, priority });
const ids = (groups: ReturnType<typeof groupMyTasks>) => groups.map((g) => [g.id, g.tasks.map((x) => x.title)]);

describe("Minhas tarefas por prazo", () => {
  // 2026-10-07 é uma quarta-feira; o domingo da semana é 2026-10-11.
  it("separa em atrasadas, hoje, esta semana (até domingo), depois e sem prazo", () => {
    const groups = groupMyTasks(
      [t("ontem", "2026-10-06"), t("hoje", "2026-10-07"), t("amanhã", "2026-10-08"), t("domingo", "2026-10-11"), t("segunda", "2026-10-12"), t("sem", null)],
      "2026-10-07",
    );
    expect(ids(groups)).toEqual([
      ["overdue", ["ontem"]],
      ["today", ["hoje"]],
      ["week", ["amanhã", "domingo"]],
      ["later", ["segunda"]],
      ["none", ["sem"]],
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Atrasadas", "Hoje", "Esta semana", "Depois", "Sem prazo"]);
  });

  it("num domingo, a segunda seguinte já é Depois", () => {
    expect(ids(groupMyTasks([t("segunda", "2026-10-12")], "2026-10-11"))).toEqual([["later", ["segunda"]]]);
  });

  it("ordena por prazo, depois prioridade (urgente primeiro, sem prioridade por último), depois título", () => {
    const groups = groupMyTasks(
      [t("b", "2026-10-09", "low"), t("a", "2026-10-09", "low"), t("x", "2026-10-09", null), t("u", "2026-10-09", "urgent"), t("cedo", "2026-10-08", null)],
      "2026-10-07",
    );
    expect(ids(groups)).toEqual([["week", ["cedo", "u", "a", "b", "x"]]]);
  });

  it("sem tarefas, sem grupos", () => {
    expect(groupMyTasks([], "2026-10-07")).toEqual([]);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implementar**

```ts
import { PRIORITIES } from "./boardVisuals";
import { daysBetween } from "./metrics";
import type { CardPriority } from "../types";

// Minhas tarefas (menu da pessoa): os cards dela por prazo. "Hoje" é o dia local, o mesmo do selo
// de prazo; "Esta semana" vai de amanhã até domingo.
export type MyTaskGroupId = "overdue" | "today" | "week" | "later" | "none";

const GROUPS: { id: MyTaskGroupId; label: string }[] = [
  { id: "overdue", label: "Atrasadas" },
  { id: "today", label: "Hoje" },
  { id: "week", label: "Esta semana" },
  { id: "later", label: "Depois" },
  { id: "none", label: "Sem prazo" },
];

type Groupable = { due_date: string | null; priority: CardPriority | null; title: string };

function groupOf(due: string | null, today: string): MyTaskGroupId {
  if (!due) return "none";
  const days = daysBetween(today, due);
  const toSunday = (7 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7;
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= toSunday) return "week";
  return "later";
}

const rank = (p: CardPriority | null) => (p ? PRIORITIES.indexOf(p) : PRIORITIES.length);

function compare(a: Groupable, b: Groupable): number {
  return (a.due_date ?? "").localeCompare(b.due_date ?? "") || rank(a.priority) - rank(b.priority) || a.title.localeCompare(b.title);
}

export function groupMyTasks<T extends Groupable>(tasks: T[], today: string): { id: MyTaskGroupId; label: string; tasks: T[] }[] {
  return GROUPS.map((g) => ({ ...g, tasks: tasks.filter((t) => groupOf(t.due_date, today) === g.id).sort(compare) })).filter(
    (g) => g.tasks.length > 0,
  );
}
```
Confirme antes que `PRIORITIES` é `["urgent", "high", "medium", "low"]` e que `daysBetween(from, to)` recebe `"AAAA-MM-DD"`. Run → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/myTasks.ts src/lib/myTasks.test.ts
git commit -m "Minhas tarefas: agrupamento por prazo (função pura)"
```

---

### Task 3: Tela Minhas tarefas

**Files:** Create `src/db/myTasks.ts`, `src/hooks/useMyTasks.ts`, `src/components/my-tasks/MyTasksView.tsx`. Modify `src/components/ui/AppMenu.tsx`, `src/App.tsx`, `e2e/layout.spec.ts`.

**Interfaces:**
- Consumes: `groupMyTasks` (Task 2); `localDay` (`src/lib/dashboardRules.ts`); `DueBadge`; `PRIORITY_LABEL`.
- Produces: `type MyTask = { id: number; title: string; due_date: string | null; priority: CardPriority | null; board_id: number; board: { name: string }; list: { name: string } }`; `listMyTasks(teamId: number, userId: string): Promise<MyTask[]>`; `useMyTasks(teamId, userId)`; `MyTasksView({ teamId, userId, onBack, onOpenCard: (task: MyTask) => void })`; `AppView` com `"my-tasks"`.

- [ ] **Step 1: Teste de ponta a ponta (falha primeiro)**

Em `e2e/layout.spec.ts`, no `fulfillRest`, antes do `HEAD`:
```ts
  // Minhas tarefas: a consulta com os nomes de board e coluna.
  if (table === "card" && url.searchParams.get("select")?.includes("board!inner")) {
    return route.fulfill({ json: overrides.myTasks ?? [] });
  }
```
e o teste:
```ts
const dayFromToday = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("Minhas tarefas: cards meus por prazo, sem os concluídos e arquivados, e o clique abre o card", async ({ page }) => {
  const task = (id: number, title: string, due_date: string | null) => ({ id, title, due_date, priority: null, board_id: 1, board: { name: "Board E2E" }, list: { name: "Coluna longa" } });
  await openLongBoard(page, "/", { myTasks: [task(3, "Card 3", dayFromToday(-1)), task(5, "Card 5", dayFromToday(0)), task(7, "Card 7", null)] });
  await page.getByRole("button", { name: "Menu" }).click();
  const request = page.waitForRequest((r) => r.url().includes("/rest/v1/card") && r.url().includes("board%21inner"));
  await page.getByRole("menuitem", { name: "Minhas tarefas" }).click();
  const url = new URL((await request).url());
  expect(url.searchParams.get("assignee_id")).toBe(`eq.${USER_ID}`);
  expect(url.searchParams.get("archived_at")).toBe("is.null");
  expect(url.searchParams.get("list.status")).toBe("neq.done");
  expect(url.searchParams.get("board.team_id")).toBe("eq.1");
  await expect(page.getByRole("heading", { name: "Atrasadas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sem prazo" })).toBeVisible();
  await page.getByRole("button", { name: /Card 5/ }).click();
  await expect(page.getByRole("dialog").getByText("Card 5")).toBeVisible();
});
```
(Se o painel do card não for `role="dialog"`, use o mesmo seletor que os outros testes usam para o painel do card aberto — procure por `initialSelectedCardId`/`?card=` em `layout.spec.ts`.) Run → FAIL (item não existe).

- [ ] **Step 2: Banco e hook**

`src/db/myTasks.ts`:
```ts
import { must, supabase } from "./supabase";
import type { CardPriority } from "../types";

export type MyTask = {
  id: number;
  title: string;
  due_date: string | null;
  priority: CardPriority | null;
  board_id: number;
  board: { name: string };
  list: { name: string };
};

/** Cards abertos atribuídos à pessoa, em todos os boards da equipe (sem arquivados e sem coluna "done"). */
export async function listMyTasks(teamId: number, userId: string): Promise<MyTask[]> {
  return must(
    await supabase
      .from("card")
      .select("id, title, due_date, priority, board_id, board!inner(name, team_id), list!inner(name, status)")
      .eq("assignee_id", userId)
      .is("archived_at", null)
      .eq("board.team_id", teamId)
      .neq("list.status", "done"),
  ) as unknown as MyTask[];
}
```
`src/hooks/useMyTasks.ts`:
```ts
import { useQuery } from "@tanstack/react-query";
import { listMyTasks } from "../db/myTasks";

export function useMyTasks(teamId: number, userId: string) {
  return useQuery({ queryKey: ["myTasks", teamId, userId], queryFn: () => listMyTasks(teamId, userId), refetchOnMount: "always" });
}
```

- [ ] **Step 3: Tela**

`src/components/my-tasks/MyTasksView.tsx`: `PageHeader title="Minhas tarefas" onBack`; `groupMyTasks(data, localDay(new Date()))`; cada grupo: `<h2>` (`text-sm font-semibold uppercase tracking-wide text-text-muted`) com o rótulo e a contagem; cada tarefa um `<button>` em linha (`rounded-xl border border-border bg-bg-card px-3 py-2 text-left hover:border-highlight`) com o título (`text-text-primary`), abaixo "Board › Coluna" (`text-xs text-text-muted`), à direita `DueBadge due={task.due_date} withLabel` (se houver prazo) e a prioridade como texto pequeno (`PRIORITY_LABEL`). Carregando: nada (como o resto do app); erro: `EmptyState` "Não foi possível carregar suas tarefas."; vazio: `EmptyState` título "Nada atribuído a você agora." Layout da página igual ao de `SettingsView` (`flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6`, conteúdo `max-w-2xl`).

- [ ] **Step 4: Menu e App**

`AppMenu.tsx`: `AppView` ganha `"my-tasks"`; primeiro item do bloco: `<Item view={view} onGo={go} target="my-tasks" icon={<IconCheck size={16} />}>Minhas tarefas</Item>` (ou um ícone de lista novo em `icons.tsx` no mesmo estilo; `IconCheck` já existe). Em `App.tsx`, no `TeamWorkspace`, antes de `view === "settings"`:
```tsx
      ) : view === "my-tasks" ? (
        <MyTasksView
          teamId={team.id}
          userId={userId}
          onBack={() => setView("board")}
          onOpenCard={(task) => handleNavigate({ type: "card", id: task.id, board_id: task.board_id } as SearchResult)}
        />
```
Confira o tipo `SearchResult` e passe só os campos que `handleNavigate` usa; se exigir mais campos, extraia `openCard(boardId, cardId)` de `handleNavigate` e use nos dois lugares.

- [ ] **Step 5: Verificar e commit**

Run o teste do Step 1 → PASS. `npx tsc --noEmit -p . && npm run lint && npm test`.
```bash
git add src/db/myTasks.ts src/hooks/useMyTasks.ts src/components/my-tasks src/components/ui/AppMenu.tsx src/App.tsx e2e/layout.spec.ts
git commit -m "Minhas tarefas: cards atribuídos a mim em todos os boards, por prazo"
```

---

### Task 4: Boas-vindas no primeiro acesso

**Files:** Create `src/components/ui/WelcomeDialog.tsx`. Modify `src/App.tsx`, `e2e/mockSession.ts`, `e2e/app.spec.ts`, `e2e/layout.spec.ts`.

**Interfaces:**
- Produces: `shouldWelcome(): boolean`, `markWelcomed(): void`, `WelcomeDialog({ name, isAdmin, onClose, onOpenMyTasks })`.

- [ ] **Step 1: Os testes antigos não veem o painel**

`e2e/mockSession.ts`, dentro de `mockSession`, junto com o `addInitScript` da sessão:
```ts
  // Os testes começam como quem já viu as boas-vindas; o teste delas apaga a chave.
  await page.addInitScript(() => localStorage.setItem("tododay.welcomed", "1"));
```
`e2e/app.spec.ts`, no começo de `signIn`: `await page.addInitScript(() => localStorage.setItem("tododay.welcomed", "1"));`.

- [ ] **Step 2: Testes novos (falham primeiro)**

```ts
test("boas-vindas: aparecem uma vez, com a dica de admin, e não voltam depois de fechar", async ({ page }) => {
  await mockSession(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("primeira")) {
      sessionStorage.setItem("primeira", "1");
      localStorage.removeItem("tododay.welcomed");
    }
  });
  await page.route("**/rest/v1/**", (route) => fulfillRest(route));
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: /Bem-vindo ao Tododay, E2E/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Gerar link de acesso")).toBeVisible();
  await dialog.getByRole("button", { name: "Começar" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Card 30")).toBeAttached();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("boas-vindas do membro: dica de perfil, e Ver minhas tarefas abre a tela", async ({ page }) => {
  await mockSession(page);
  await page.addInitScript(() => localStorage.removeItem("tododay.welcomed"));
  await page.route("**/rest/v1/**", (route) =>
    fulfillRest(route, { team_member: [{ role: "member", team: { id: 1, name: "Equipe E2E", created_by: USER_ID, created_at: NOW } }] }),
  );
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: /Bem-vindo/ });
  await expect(dialog.getByText("troque a senha")).toBeVisible();
  await expect(dialog.getByText("Gerar link de acesso")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Ver minhas tarefas" }).click();
  await expect(page.getByRole("heading", { name: "Minhas tarefas" })).toBeVisible();
});
```
(O `addInitScript` do Step 1 roda antes; a ordem dos init scripts é a ordem em que foram adicionados, então o `removeItem` do teste vence. No primeiro teste, o `sessionStorage` faz a remoção só no primeiro carregamento, para o `reload` provar que a chave ficou gravada.) Run → FAIL.

- [ ] **Step 3: Componente**

`src/components/ui/WelcomeDialog.tsx`:
```tsx
import { useEffect } from "react";
import { motion } from "framer-motion";

const KEY = "tododay.welcomed";

/** Primeira entrada neste navegador? Erro no localStorage (modo privado, bloqueado): não mostra. */
export function shouldWelcome(): boolean {
  try {
    return localStorage.getItem(KEY) === null;
  } catch {
    return false;
  }
}

export function markWelcomed(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Sem localStorage o painel volta na próxima vez; não há o que fazer.
  }
}

interface WelcomeDialogProps {
  name: string;
  isAdmin: boolean;
  onClose: () => void;
  onOpenMyTasks: () => void;
}

/** Painel do primeiro acesso: onde ficam cards, tarefas, busca e perfil (ou convites, para o admin). */
export function WelcomeDialog({ name, isAdmin, onClose, onOpenMyTasks }: WelcomeDialogProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const firstName = name.trim().split(/\s+/)[0] || "";
  const tips = [
    ["Cards", "Crie cards na coluna, arraste entre colunas ou use Mover para…. Clique no card para prazo, responsável, checklist e anexos."],
    ["Minhas tarefas", "No menu com seu nome, tudo o que está com você, por prazo."],
    ["Busca", "Ctrl+K procura em todos os boards; / filtra o board aberto, e o filtro Eu mostra só os seus."],
    isAdmin
      ? ["Equipe", "Convide a equipe pelo menu, em Equipe. Se o e-mail não chegar, use Gerar link de acesso."]
      : ["Perfil", "Confira seu nome e troque a senha em Configurações."],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-border bg-bg-surface p-6"
      >
        <h2 id="welcome-title" className="text-lg font-semibold text-text-primary">
          Bem-vindo ao Tododay{firstName && `, ${firstName}`}
        </h2>
        <ul className="flex flex-col gap-3">
          {tips.map(([title, text]) => (
            <li key={title} className="text-sm">
              <span className="font-semibold text-text-primary">{title}: </span>
              <span className="text-text-muted">{text}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onOpenMyTasks} className="rounded-lg px-4 py-2 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary">
            Ver minhas tarefas
          </button>
          <button type="button" autoFocus onClick={onClose} className="btn-primary px-4 py-2">
            Começar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 4: Ligar no `TeamWorkspace`**

```tsx
  const { data: profile } = useProfile(userId);
  const [welcome, setWelcome] = useState(shouldWelcome);
  function closeWelcome(next?: AppView) {
    markWelcomed();
    setWelcome(false);
    if (next) navigate(next);
  }
  ...
  {welcome && profile && (
    <WelcomeDialog
      name={profile.display_name}
      isAdmin={team.role === "admin"}
      onClose={() => closeWelcome()}
      onOpenMyTasks={() => closeWelcome("my-tasks")}
    />
  )}
```
(logo antes do `<AnimatePresence>` da paleta.)

- [ ] **Step 5: Verificar e commit**

Run os dois testes → PASS; depois a suíte simulada inteira `npm run test:e2e:mock` (os antigos continuam verdes). `npx tsc --noEmit -p . && npm run lint && npm test`.
```bash
git add src/components/ui/WelcomeDialog.tsx src/App.tsx e2e/mockSession.ts e2e/app.spec.ts e2e/layout.spec.ts
git commit -m "Boas-vindas no primeiro acesso: cards, minhas tarefas, busca e perfil ou convites"
```

---

### Task 5: Verificação contra o dev, docs e PR

- [ ] **Step 1: Senha de verdade no dev** — `npm run dev`, entrar com a conta E2E (`E2E_EMAIL`/`E2E_PASSWORD` do `.env`), Configurações → trocar para uma senha temporária, sair, entrar com ela, e trocar de volta para `E2E_PASSWORD`. Esperado: toasts "Senha trocada"; o `npm run test:e2e` (app.spec) continua passando depois.
- [ ] **Step 2: `npx playwright test e2e/app.spec.ts`** contra o dev → verde.
- [ ] **Step 3: Docs** — `CLAUDE.md`: na linha de Preferências, acrescentar "`tododay.welcomed` (boas-vindas vistas)"; uma linha "Minhas tarefas (`src/lib/myTasks.ts`, menu da pessoa) e Perfil (nome e senha em Configurações)". `CHANGELOG.md` (v1.0.0-beta → Geral): "Minhas tarefas, perfil (nome e senha) e boas-vindas no primeiro acesso."
- [ ] **Step 4: Commit, localhost para o usuário revisar, depois PR e merge após o CI.**
