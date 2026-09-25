import { expect, test, type Page } from "@playwright/test";
import { BOARD_NAME, readEnv } from "./seed";

const env = readEnv();

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("E-mail").fill(env.E2E_EMAIL);
  await page.getByLabel("Senha").fill(env.E2E_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByPlaceholder("Nova coluna...")).toBeVisible();
  await expect(page.getByText(BOARD_NAME).first()).toBeVisible();
}

test("cria coluna e card, usa o painel, arquiva e exclui", async ({ page }) => {
  await signIn(page);
  const listName = `Coluna ${Date.now()}`;

  await page.getByPlaceholder("Nova coluna...").fill(listName);
  await page.getByPlaceholder("Nova coluna...").press("Enter");
  const column = page.locator("div.bg-bg-column").filter({ hasText: listName });
  await expect(column).toBeVisible();
  await expect(column.getByText("Nenhum card ainda.")).toBeVisible();

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
  await expect(column.getByText("Nenhum card ainda.")).toBeVisible();

  await column.getByRole("button", { name: "Excluir coluna" }).click();
  await expect(column).toHaveCount(0);
});

test("configurações trocam tema e densidade e ficam salvas", async ({ page }) => {
  await signIn(page);
  const html = page.locator("html");

  await page.getByRole("button", { name: "Configurações" }).click();
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

  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("radio", { name: "Sistema" }).click();
  await page.getByRole("radio", { name: "Normal" }).click();
});
