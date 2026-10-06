import { expect, test, type Page } from "@playwright/test";
import { BOARD_NAME, readEnv } from "./seed";

const env = readEnv();

async function signIn(page: Page) {
  await page.addInitScript(() => localStorage.setItem("tododay.welcomed", "1"));
  await page.goto("/");
  await page.getByLabel("E-mail").fill(env.E2E_EMAIL);
  await page.getByLabel("Senha").fill(env.E2E_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByPlaceholder("Nova coluna...")).toBeVisible();
  await expect(page.getByText(BOARD_NAME).first()).toBeVisible();
}

async function openFromMenu(page: Page, item: string) {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("cria coluna e card, usa o painel, arquiva e exclui", async ({ page }) => {
  await signIn(page);
  const listName = `Coluna ${Date.now()}`;

  await page.getByPlaceholder("Nova coluna...").fill(listName);
  await page.getByPlaceholder("Nova coluna...").press("Enter");
  const column = page.locator("div.bg-bg-column").filter({ hasText: listName });
  await expect(column).toBeVisible();
  await expect(column.getByText("Nenhuma tarefa aqui")).toBeVisible();

  await column.getByPlaceholder("Novo card...").fill("Card de teste");
  await column.getByPlaceholder("Novo card...").press("Enter");
  const card = column.locator("div.bg-bg-card").filter({ hasText: "Card de teste" });
  await expect(card).toBeVisible();

  await card.click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole("button", { name: "Fechar painel" })).toBeVisible();
  await page.getByPlaceholder("Novo item...").fill("Primeiro item");
  await page.getByPlaceholder("Novo item...").press("Enter");
  await expect(page.getByText("Primeiro item")).toBeVisible();
  await page.getByRole("button", { name: "Fechar painel" }).click();
  await expect(card.getByText("0/1")).toBeVisible();

  await card.getByRole("button", { name: "Arquivar card" }).click();
  await expect(column.getByText("Nenhuma tarefa aqui")).toBeVisible();

  await column.getByRole("button", { name: `Configurações da coluna ${listName}`, exact: true }).click();
  await page.getByRole("button", { name: "Excluir coluna" }).click();
  await expect(column).toHaveCount(0);
});

test("configurações trocam tema e densidade e ficam salvas", async ({ page }) => {
  await signIn(page);
  const html = page.locator("html");

  await openFromMenu(page, "Configurações");
  await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();

  await page.getByRole("radio", { name: "Escuro" }).click();
  await expect(html).toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Claro" }).click();
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole("radio", { name: "Compacto" }).click();
  await page.reload();
  await expect(page.getByPlaceholder("Nova coluna...")).toBeVisible();
  await expect(html).not.toHaveClass(/dark/);
  expect(await page.evaluate(() => [localStorage.getItem("tododay.theme"), localStorage.getItem("tododay.density")])).toEqual([
    "light",
    "compact",
  ]);

  await openFromMenu(page, "Configurações");
  await page.getByRole("radio", { name: "Sistema" }).click();
  await page.getByRole("radio", { name: "Normal" }).click();
});

test("dashboard gera demonstração, troca período e pessoa, mostra tabela e sai", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("O dashboard ainda não tem dados")).toBeVisible();

  await page.getByRole("button", { name: "Gerar demonstração" }).click();
  await expect(page.getByText("Demonstração", { exact: true })).toBeVisible();
  await expect(page.getByText("Entregas por semana")).toBeVisible();

  await page.getByRole("radio", { name: "26 sem." }).click();
  await page.getByRole("radio", { name: /Carla Dias/ }).click();
  await expect(page.getByText("Carga ao longo do tempo")).toBeVisible();

  await page.getByRole("button", { name: "Ver tabela" }).first().click();
  await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(26);

  await page.getByRole("button", { name: "Sair da demonstração" }).click();
  await expect(page.getByText("O dashboard ainda não tem dados")).toBeVisible();
});

test("renomeia e exclui um board", async ({ page }) => {
  await signIn(page);
  const name = `Board ${Date.now()}`;

  await page.getByRole("button", { name: "Novo board" }).click();
  await page.getByPlaceholder("Nome do board...").fill(name);
  await page.getByPlaceholder("Nome do board...").press("Enter");
  // Board novo já nasce com as colunas padrão.
  for (const column of ["A fazer", "Em andamento", "Feito"]) {
    await expect(page.locator("div.bg-bg-column").filter({ hasText: column })).toBeVisible();
  }
  await page.getByPlaceholder("Nova coluna...").fill("Coluna do board");
  await page.getByPlaceholder("Nova coluna...").press("Enter");
  await expect(page.locator("div.bg-bg-column").filter({ hasText: "Coluna do board" })).toBeVisible();

  const renamed = `${name} renomeado`;
  await page.getByRole("button", { name: `Opções do board ${name}` }).click();
  await page.getByRole("button", { name: "Renomear" }).click();
  await page.getByLabel("Novo nome do board").fill(renamed);
  await page.getByLabel("Novo nome do board").press("Enter");
  await expect(page.getByRole("button", { name: renamed, exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Opções do board ${renamed}` }).click();
  await page.getByRole("button", { name: "Excluir board" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("4 colunas e 0 cards")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Excluir board" })).toBeDisabled();
  await dialog.getByRole("textbox").fill(renamed);
  await dialog.getByRole("button", { name: "Excluir board" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: renamed, exact: true })).toHaveCount(0);
  await expect(page.getByText(BOARD_NAME).first()).toBeVisible();
});
