import { expect, test } from "@playwright/test";
import { mockSession } from "./mockSession";

// Só roda em `npm run test:e2e:csp`, junto com os outros testes simulados: o build servido com os
// cabeçalhos do vercel.json. Os outros cobrem board, dashboard, demonstração e anexos sob a CSP;
// este confere os cabeçalhos, o script inline do tema e que o navegador não acusou nenhuma recusa.

test("a CSP de produção não bloqueia nada do app (login, tema, tela logada)", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  page.on("pageerror", (e) => violations.push(e.message));

  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  // O script inline do tema rodou (o hash dele está na CSP): sem ele não haveria a classe do tema.
  await page.evaluate(() => localStorage.setItem("tododay.theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await mockSession(page);
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.getByText("Você ainda não está em nenhuma equipe")).toBeVisible();

  expect(violations).toEqual([]);
});
