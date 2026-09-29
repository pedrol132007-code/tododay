import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import { env, mockSession, USER_ID } from "./mockSession";

// Anexos no card aberto, com o Supabase simulado (REST, Storage e a Edge Function). As regras do
// servidor têm teste próprio: supabase/tests/0011_attachments_test.sql e src/lib/attachmentRules.test.ts.

const NOW = "2026-09-28T12:00:00Z";
const PNG = readFileSync("src-tauri/icons/128x128.png");

const attachment = (id: number, name: string, mime: string, size: number) => ({
  id,
  card_id: 1,
  board_id: 1,
  name,
  mime_type: mime,
  size_bytes: size,
  storage_path: `1/0000000${id}-0000-4000-8000-000000000000`,
  uploaded_by: USER_ID,
  uploaded_by_name: "E2E",
  created_at: NOW,
  is_cover: false,
});

const ROWS = [
  attachment(1, "foto-da-nota.png", "image/png", 245_000),
  attachment(2, "contrato.pdf", "application/pdf", 1_480_000),
  attachment(3, "print-erro.png", "image/png", 90_000),
];

async function openCard(page: Page, { role = "admin", finalize }: { role?: string; finalize?: (route: Route) => unknown } = {}) {
  const uploads: string[] = [];
  const tables: Record<string, unknown> = {
    profile: { id: USER_ID, email: env.E2E_EMAIL, display_name: "E2E", created_at: NOW },
    board: [{ id: 1, team_id: 1, name: "Board E2E", position: 1, created_at: NOW }],
    list: [{ id: 1, board_id: 1, name: "Coluna", position: 1, wip_limit: null, status: "todo" }],
    card: [
      {
        id: 1, list_id: 1, board_id: 1, title: "Card com anexos", description: "", position: 1, due_date: "2026-10-30",
        created_at: NOW, updated_at: NOW, archived_at: null, assignee_id: null, priority: null, list_entered_at: NOW,
      },
    ],
    card_attachment: ROWS,
  };
  await mockSession(page);
  await page.route("**/rest/v1/**", (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop()!;
    if (route.request().method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "0-0/1" }, body: "" });
    if (table === "team_member") {
      return route.fulfill({
        json: url.searchParams.get("select")?.includes("profile")
          ? [{ team_id: 1, user_id: USER_ID, role, job_title: "", joined_at: NOW, profile: { email: env.E2E_EMAIL, display_name: "E2E" } }]
          : [{ role, team: { id: 1, name: "Equipe E2E", created_by: USER_ID, created_at: NOW } }],
      });
    }
    return route.fulfill({ json: tables[table] ?? [] });
  });
  await page.route("**/storage/v1/object/sign/attachments", (route) => {
    const { paths } = route.request().postDataJSON() as { paths: string[] };
    return route.fulfill({ json: paths.map((p) => ({ path: p, signedURL: `/object/sign/attachments/${p}?token=x`, error: null })) });
  });
  await page.route("**/storage/v1/object/sign/attachments/**", (route) => route.fulfill({ body: PNG, contentType: "image/png" }));
  // Envio ao Storage: fica pendurado até o teste cancelar (ou responde na hora, com finalize).
  await page.route("**/storage/v1/object/attachments/**", async (route) => {
    uploads.push(route.request().url());
    if (finalize) return route.fulfill({ json: { Key: "ok" } });
    await new Promise(() => {});
  });
  if (finalize) await page.route("**/functions/v1/attachments", finalize);

  await page.goto("/");
  await page.getByTitle(/^Vence em/).click();
  await expect(page.getByText("contrato.pdf")).toBeVisible();
  return { uploads };
}

test("lista os anexos; envio mostra progresso e pode ser cancelado; tipo proibido nem sobe", async ({ page }) => {
  const { uploads } = await openCard(page);
  await expect(page.getByText("1,4 MB · E2E")).toBeVisible();
  await expect(page.getByRole("link", { name: "contrato.pdf", exact: true })).toHaveAttribute("target", "_blank");

  await page.locator("input[type=file]").setInputFiles({ name: "planilha.xlsx", mimeType: "application/octet-stream", buffer: Buffer.alloc(2000) });
  await expect(page.getByRole("progressbar", { name: "Enviando planilha.xlsx" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar envio de planilha.xlsx" }).click();
  await expect(page.getByText("planilha.xlsx")).not.toBeAttached();

  const before = uploads.length;
  await page.locator("input[type=file]").setInputFiles({ name: "instalador.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
  await expect(page.getByRole("alert")).toContainText("Esse tipo de arquivo não é aceito");
  expect(uploads.length).toBe(before);
});

test("o motivo da recusa do servidor aparece como veio", async ({ page }) => {
  await openCard(page, {
    finalize: (route) => route.fulfill({ status: 422, json: { error: "O conteúdo do arquivo não confere com a extensão dele.", problem: "content" } }),
  });
  await page.locator("input[type=file]").setInputFiles({ name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ programa") });
  await expect(page.getByRole("alert")).toHaveText("O conteúdo do arquivo não confere com a extensão dele.");
});

test("imagem amplia, as setas passam para a próxima e Esc fecha só a imagem", async ({ page }) => {
  await openCard(page);
  await page.getByRole("button", { name: "foto-da-nota.png", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Imagem foto-da-nota.png" })).toBeVisible();
  await expect(page.getByText("1 de 2")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "Imagem print-erro.png" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /^Imagem/ })).not.toBeAttached();
  await expect(page.getByText("contrato.pdf")).toBeVisible();
});

test("leitor vê e baixa, mas não envia, não troca a capa e não exclui", async ({ page }) => {
  await openCard(page, { role: "viewer" });
  await expect(page.getByRole("link", { name: "Baixar contrato.pdf" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Anexar arquivo" })).not.toBeAttached();
  await expect(page.getByRole("button", { name: /^Excluir / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /como capa$/ })).toHaveCount(0);
});
