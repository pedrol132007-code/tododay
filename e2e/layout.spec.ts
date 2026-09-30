import { expect, test, type Page, type Route } from "@playwright/test";
import { env, mockSession, USER_ID } from "./mockSession";

// Layout do board com uma coluna longa. Não usa o banco: a sessão vai direto no localStorage e
// as respostas do Supabase são simuladas, então roda mesmo sem a conta E2E.

const NOW = "2026-09-28T12:00:00Z";

const cards = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  list_id: 1,
  board_id: 1,
  title: `Card ${i + 1}`,
  description: "",
  position: i + 1,
  due_date: null,
  created_at: NOW,
  updated_at: NOW,
  archived_at: null,
  assignee_id: null,
  priority: null,
  list_entered_at: NOW,
}));

const tables: Record<string, unknown> = {
  profile: { id: USER_ID, email: env.E2E_EMAIL, display_name: "E2E", created_at: NOW },
  team_member: [{ role: "admin", team: { id: 1, name: "Equipe E2E", created_by: USER_ID, created_at: NOW } }],
  board: [{ id: 1, team_id: 1, name: "Board E2E", position: 1, created_at: NOW }],
  list: [
    { id: 1, board_id: 1, name: "Coluna longa", position: 1, wip_limit: null, status: "todo" },
    { id: 2, board_id: 1, name: "Coluna curta", position: 2, wip_limit: null, status: "todo" },
  ],
  card: cards,
};

async function fulfillRest(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const table = url.pathname.split("/").pop()!;
  // Os cards são todos da coluna 1; a coluna 2 fica vazia.
  const ofList = table === "card" && url.searchParams.get("list_id") === "eq.2" ? [] : null;
  // team_member responde a duas consultas: as equipes do usuário (com team) e os membros (com profile).
  if (table === "team_member" && url.searchParams.get("select")?.includes("profile")) {
    return route.fulfill({
      json: [{ team_id: 1, user_id: USER_ID, role: "admin", job_title: "", joined_at: NOW, profile: { email: env.E2E_EMAIL, display_name: "E2E" } }],
    });
  }
  if (request.method() === "HEAD") {
    return route.fulfill({ status: 200, headers: { "content-range": `0-0/${ofList ? 0 : cards.length}` }, body: "" });
  }
  return route.fulfill({ json: ofList ?? tables[table] ?? [] });
}

async function openLongBoard(page: Page, path = "/") {
  await mockSession(page);
  await page.route("**/rest/v1/**", fulfillRest);
  await page.goto(path);
  await expect(page.getByText("Card 30")).toBeAttached();
}

// A casca do app (h-screen, overflow-hidden) cabe na tela e nunca rola: se rolasse, a barra do
// topo subiria e não haveria como trazê-la de volta. Quem rola é a view abaixo dela.
async function expectShellFits(page: Page) {
  const shell = page.locator("#root > div").first();
  expect(await shell.evaluate((e) => ({ overflow: e.scrollHeight - e.clientHeight, scrollTop: e.scrollTop }))).toEqual({
    overflow: 0,
    scrollTop: 0,
  });
}

test("coluna longa rola sozinha, como no Trello, sem mexer no resto da tela", async ({ page }) => {
  await openLongBoard(page);
  const longList = page.locator("div.bg-bg-column").filter({ hasText: "Coluna longa" });
  const shortList = page.locator("div.bg-bg-column").filter({ hasText: "Coluna curta" });
  const input = longList.getByPlaceholder("Novo card...");

  // Título e "Novo card..." ficam visíveis sem rolar; quem rola são só os cards da coluna.
  await expect(longList.getByText("Coluna longa")).toBeInViewport({ ratio: 1 });
  await expect(input).toBeInViewport({ ratio: 1 });
  await expect(longList.getByText("Card 30")).not.toBeInViewport();
  // Espera a animação de entrada das colunas (framer-motion) terminar antes de medir.
  let shortBox = await shortList.boundingBox();
  await expect
    .poll(async () => {
      const previous = shortBox;
      shortBox = await shortList.boundingBox();
      return JSON.stringify(shortBox) === JSON.stringify(previous);
    })
    .toBe(true);

  await longList.getByText("Card 10").hover();
  await page.mouse.wheel(0, 5000);
  await expect(longList.getByText("Card 30")).toBeInViewport();
  await expect(longList.getByText("Coluna longa")).toBeInViewport({ ratio: 1 });
  // A coluna vizinha não se mexe e continua do tamanho do conteúdo.
  expect(await shortList.boundingBox()).toEqual(shortBox);
  expect(shortBox!.height).toBeLessThan(300);

  await input.click();
  await page.keyboard.type("Mais um card");
  await expectShellFits(page);
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeInViewport({ ratio: 1 });
});

test("muitos arquivados rolam dentro da view, sem esconder a barra do topo", async ({ page }) => {
  await openLongBoard(page);
  await page.getByRole("button", { name: "Opções do board Board E2E" }).click();
  await page.getByRole("button", { name: "Arquivados" }).click();
  const last = page.getByRole("button", { name: "Restaurar" }).last();
  await last.focus();

  await expectShellFits(page);
  await expect(last).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeInViewport({ ratio: 1 });
});

test("dashboard rola só por dentro: a página não ganha barra de rolagem própria", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openLongBoard(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Gerar demonstração" }).click();
  await expect(page.getByText("Entregas por semana")).toBeVisible();

  // Um elemento `absolute` que escapa da área de rolagem aumenta o documento e cria uma segunda
  // barra, que arrasta o app inteiro (barra do topo junto).
  const doc = await page.evaluate(() => {
    const d = document.scrollingElement!;
    return { extraX: d.scrollWidth - d.clientWidth, extraY: d.scrollHeight - d.clientHeight };
  });
  expect(doc).toEqual({ extraX: 0, extraY: 0 });
  await expectShellFits(page);
});

test("demonstração: o board mostra as tarefas fictícias do dashboard e sai sem tocar no board real", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openLongBoard(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Gerar demonstração" }).click();
  await expect(page.getByText("Entregas por semana")).toBeVisible();

  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Operações/ })).toBeVisible();
  for (const name of ["A fazer", "Em andamento", "Em revisão", "Concluído"]) await expect(page.getByRole("region", { name })).toBeVisible();
  await expect(page.getByText("Card 30")).not.toBeAttached();
  await expectShellFits(page);

  // Alguns cards têm anexos de exemplo, criados no navegador; o card abre só para leitura.
  await page.getByRole("button", { name: /^Abrir / }).filter({ has: page.getByTitle(/^\d+ anexos?$/) }).first().click();
  await expect(page.getByText("Arquivos fictícios, criados no seu navegador. Nada foi enviado.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Arquivos fictícios")).not.toBeAttached();

  // A mesma demonstração continua no dashboard.
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("Entregas por semana")).toBeVisible();
  await page.getByRole("button", { name: "Board", exact: true }).click();

  await page.getByRole("button", { name: "Sair da demonstração" }).click();
  await expect(page.getByText("Card 30")).toBeAttached();
});

test("filtros na URL: o link abre o board filtrado, com chip e Limpar filtros", async ({ page }) => {
  await openLongBoard(page, "/?busca=card%203");
  await expect(page.getByText("2 de 30 tarefas")).toBeVisible();
  await expect(page.getByText("Card 3", { exact: true })).toBeVisible();
  await expect(page.getByText("Card 12", { exact: true })).not.toBeAttached();
  await expect(page.getByRole("button", { name: "Remover filtro Busca: “card 3”" })).toBeVisible();
  await expect(page.getByText("arrastar cards fica desligado")).toBeVisible();
  await expect(page.getByText("Nenhuma tarefa aqui")).toBeVisible(); // a coluna curta já era vazia

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.getByText("Card 12", { exact: true })).toBeAttached();
  expect(new URL(page.url()).search).toBe("");
});

test("link do dashboard abre o board de demonstração já filtrado", async ({ page }) => {
  await openLongBoard(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Gerar demonstração" }).click();
  await page.getByRole("button", { name: /tarefas? atrasadas?.*Ver no board/ }).click();

  await expect(page.getByRole("heading", { name: /Operações/ })).toBeVisible();
  const search = new URL(page.url()).searchParams;
  expect(search.get("atrasadas")).toBe("1");
  expect(search.get("responsavel")).toBeTruthy();
  await expect(page.getByRole("button", { name: "Remover filtro Atrasadas" })).toBeVisible();
  await expect(page.getByText(/^\d+ de \d+ tarefas/)).toBeVisible();
});

test("número do dashboard = cards no board filtrado; Voltar mantém o período e a pessoa", async ({ page }) => {
  await openLongBoard(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Gerar demonstração" }).click();
  await page.locator("button[aria-haspopup=dialog]").click();
  await page.getByRole("radio", { name: "Últimos 30 dias" }).click();
  await expect(page.locator("button[aria-haspopup=dialog]")).toHaveText(/Últimos 30 dias/);

  // "Em andamento" da carga da equipe: o número clicado é o que o board mostra.
  const label = (await page.locator("button[aria-label^='Ver as '][aria-label*='em andamento']").first().getAttribute("aria-label"))!;
  const shown = Number(label.match(/Ver as (\d+)/)![1]);
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByText(new RegExp(`^${shown} de \\d+ tarefas`))).toBeVisible();
  await expect(page.getByText(/^Aberto pelo dashboard: Carga da equipe/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover filtro Colunas em andamento" })).toBeVisible();

  await page.getByRole("button", { name: "← Voltar ao dashboard" }).click();
  await expect(page.locator("button[aria-haspopup=dialog]")).toHaveText(/Últimos 30 dias/);
  expect(new URL(page.url()).searchParams.get("coluna")).toBeNull();

  // Na visão de uma pessoa, uma tarefa da lista abre direto no board, e o Voltar volta para ela.
  await page.getByRole("radio", { name: /Bruno/ }).click();
  await page.getByRole("button", { name: /^Entregas/ }).first().click();
  const task = page.locator("aside li button").first();
  const title = (await task.locator("span").first().innerText()).split("\n")[0];
  await task.click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "← Voltar ao dashboard" }).click();
  await expect(page.getByRole("heading", { name: /Dashboard · Bruno/ })).toBeVisible();
  await expect(page.locator("button[aria-haspopup=dialog]")).toHaveText(/Últimos 30 dias/);
});
