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

/** Tabelas trocadas num teste (ex.: uma coluna Concluído com cards antigos). */
type Overrides = Partial<Record<string, unknown>>;

async function fulfillRest(route: Route, overrides: Overrides = {}) {
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
  // Minhas tarefas: a consulta com os nomes de board e coluna.
  if (table === "card" && url.searchParams.get("select")?.includes("board!inner")) {
    return route.fulfill({ json: overrides.myTasks ?? [] });
  }
  if (request.method() === "HEAD") {
    return route.fulfill({ status: 200, headers: { "content-range": `0-0/${ofList ? 0 : cards.length}` }, body: "" });
  }
  if (request.method() === "PATCH") return route.fulfill({ status: 204, body: "" });
  return route.fulfill({ json: ofList ?? overrides[table] ?? tables[table] ?? [] });
}

async function openLongBoard(page: Page, path = "/", overrides: Overrides = {}) {
  await mockSession(page);
  await page.route("**/rest/v1/**", (route) => fulfillRest(route, overrides));
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

test("menu da coluna numa janela baixa: Excluir coluna aparece e recebe o clique", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 650 });
  await openLongBoard(page);
  await page.getByRole("button", { name: "Configurações da coluna Coluna curta", exact: true }).click();
  const del = page.getByRole("button", { name: "Excluir coluna", exact: true });
  await expect(del).toBeInViewport({ ratio: 1 });
  // Nada por cima (a linha do board cortava o menu): o ponto do meio do botão é o próprio botão.
  expect(
    await del.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return el === top || el.contains(top);
    }),
  ).toBe(true);

  // O menu fica num portal: clicar dentro não fecha nem arrasta a coluna; Esc e clique fora fecham.
  await page.getByRole("radio", { name: "Em andamento" }).click();
  await expect(del).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(del).toBeHidden();
  await page.getByRole("button", { name: "Configurações da coluna Coluna curta", exact: true }).click();
  await page.mouse.click(1000, 600);
  await expect(del).toBeHidden();

  await page.getByRole("button", { name: "Configurações da coluna Coluna curta", exact: true }).click();
  const deleted = page.waitForRequest((r) => r.method() === "DELETE" && r.url().includes("/rest/v1/list"));
  await del.click();
  expect(new URL((await deleted).url()).searchParams.get("id")).toBe("eq.2");
});

test("período personalizado: as datas cabem dentro do seletor", async ({ page }) => {
  await openLongBoard(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Gerar demonstração" }).click();
  await page.locator("button[aria-haspopup=dialog]").click();
  const dialog = page.getByRole("dialog", { name: "Período" });
  const box = (await dialog.boundingBox())!;
  for (const input of await dialog.locator("input[type=date]").all()) {
    const r = (await input.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(box.x);
    expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width);
  }
});

test("cabeçalho do board enxuto: barra numa linha só e colunas perto do topo (1100x650)", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 650 });
  await openLongBoard(page);
  const tops = await Promise.all(
    [page.getByLabel("Buscar no board"), page.getByLabel("Responsável"), page.getByRole("button", { name: /^Filtros/ }), page.getByLabel("Ordenar")].map(
      async (l) => (await l.boundingBox())!.y,
    ),
  );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(8);
  // O resumo fica na linha do título.
  const title = (await page.getByRole("heading", { name: "Board E2E" }).boundingBox())!;
  const summary = (await page.getByText(/^30 tarefas · \d+ pessoas?$/).boundingBox())!;
  expect(Math.abs(summary.y + summary.height / 2 - (title.y + title.height / 2))).toBeLessThan(8);
  const column = (await page.locator("div.bg-bg-column").first().boundingBox())!;
  expect(column.y).toBeLessThan(180);
});

test("Filtros: os outros filtros num painel, com contador e chip", async ({ page }) => {
  await openLongBoard(page);
  const button = page.getByRole("button", { name: /^Filtros/ });
  await expect(button).toHaveText("Filtros");
  await button.click();
  await page.getByLabel("Prioridade", { exact: true }).selectOption({ label: "Alta" });
  await expect(page.getByRole("button", { name: "Remover filtro Prioridade Alta" })).toBeVisible();
  await expect(button).toHaveText("Filtros · 1");
  expect(new URL(page.url()).searchParams.get("prioridade")).toBe("alta");
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Prioridade", { exact: true })).toBeHidden();
  await button.click();
  await page.mouse.click(900, 600);
  await expect(page.getByLabel("Prioridade", { exact: true })).toBeHidden();
});

test("coluna Concluído: arquivar de uma vez os que estão lá há mais de 7 dias, com Desfazer", async ({ page }) => {
  // Relógio fixo: "há mais de 7 dias" não pode depender do dia em que o teste roda.
  await page.clock.setFixedTime(new Date("2026-09-30T12:00:00"));
  const old = new Set(Array.from({ length: 12 }, (_, i) => i + 1));
  await openLongBoard(page, "/", {
    list: [
      { id: 1, board_id: 1, name: "Coluna longa", position: 1, wip_limit: null, status: "done" },
      { id: 2, board_id: 1, name: "Coluna curta", position: 2, wip_limit: null, status: "todo" },
    ],
    card: cards.map((c) => ({ ...c, list_entered_at: old.has(c.id) ? "2026-09-10T12:00:00Z" : "2026-09-28T12:00:00Z" })),
  });

  // Só colunas do tipo Concluído têm a opção.
  await page.getByRole("button", { name: "Configurações da coluna Coluna curta", exact: true }).click();
  await expect(page.getByRole("button", { name: /Arquivar concluídos/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Configurações da coluna Coluna longa", exact: true }).click();
  const archive = page.getByRole("button", { name: "Arquivar concluídos há mais de 7 dias (12)" });
  const archived = page.waitForRequest((r) => r.method() === "PATCH" && r.url().includes("/rest/v1/card"));
  await archive.click();
  const request = await archived;
  expect(new URL(request.url()).searchParams.get("id")).toBe(`in.(${[...old].join(",")})`);
  expect(request.postDataJSON().archived_at).toBeTruthy();

  const restored = page.waitForRequest((r) => r.method() === "PATCH" && r.postDataJSON()?.archived_at === null);
  await page.getByText("12 cards arquivados · estão em Arquivados").waitFor();
  await page.getByRole("button", { name: "Desfazer" }).click();
  expect(new URL((await restored).url()).searchParams.get("id")).toBe(`in.(${[...old].join(",")})`);
});

test('atalho "/" leva à busca do board, sem atrapalhar quem está digitando', async ({ page }) => {
  await openLongBoard(page);
  const search = page.getByLabel("Buscar no board");
  await page.locator("body").click({ position: { x: 1300, y: 800 } });
  await page.keyboard.press("/");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");

  // Dentro de outro campo, "/" é só um caractere.
  const newCard = page.getByPlaceholder("Novo card...").first();
  await newCard.click();
  await page.keyboard.type("a/b");
  await expect(newCard).toHaveValue("a/b");
  await expect(search).not.toBeFocused();

  // Com um card aberto (painel por cima do board), o atalho não rouba o foco.
  await page.getByRole("button", { name: "Card 1 Arquivar card" }).click({ position: { x: 200, y: 30 } });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").click({ position: { x: 10, y: 200 } });
  await page.keyboard.press("/");
  await expect(search).not.toBeFocused();
});

test("recolher coluna: vira faixa com a contagem, lembra depois de recarregar e abre de novo", async ({ page }) => {
  await openLongBoard(page);
  await page.getByRole("button", { name: "Recolher coluna Coluna longa", exact: true }).click();
  await expect(page.getByText("Card 1", { exact: true })).toBeHidden();
  const strip = page.getByRole("button", { name: "Abrir coluna Coluna longa (30 cards)" });
  await expect(strip).toBeVisible();
  expect((await strip.boundingBox())!.width).toBeLessThan(60);
  // A outra coluna continua aberta.
  await expect(page.getByRole("button", { name: "Recolher coluna Coluna curta", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Abrir coluna Coluna longa (30 cards)" })).toBeVisible();
  await expect(page.getByText("Card 1", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Abrir coluna Coluna longa (30 cards)" }).click();
  await expect(page.getByText("Card 1", { exact: true })).toBeVisible();
});

test('Responsável "Eu": filtra pelas tarefas de quem está logado', async ({ page }) => {
  await openLongBoard(page, "/", { card: cards.map((c) => ({ ...c, assignee_id: c.id === 3 ? USER_ID : null })) });
  const select = page.getByLabel("Responsável", { exact: true });
  await expect(select.locator("option").nth(1)).toHaveText("Eu (E2E)");
  await select.selectOption({ label: "Eu (E2E)" });
  await expect(page.getByText(/^1 de 30 tarefas/)).toBeVisible();
  await expect(page.getByText("Card 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover filtro E2E" })).toBeVisible();
});

test("Mover para…: escolhe coluna e posição no painel do card", async ({ page }) => {
  await openLongBoard(page);
  await page.getByRole("button", { name: "Card 5 Arquivar card" }).click({ position: { x: 200, y: 30 } });
  const panel = page.getByRole("dialog", { name: "Card 5" });
  await panel.getByRole("button", { name: "Mover", exact: true }).click();

  const column = panel.getByLabel("Coluna de destino");
  await expect(column.locator("option:checked")).toHaveText("Coluna longa (atual)");
  await column.selectOption({ label: "Coluna curta" });
  await panel.getByLabel("No fim").check();
  const moved = page.waitForRequest((r) => r.method() === "PATCH" && r.url().includes("/rest/v1/card?id=eq.5"));
  await panel.getByRole("button", { name: "Mover card" }).click();
  // Coluna curta está vazia: o card entra na posição 1.
  expect((await moved).postDataJSON()).toEqual({ list_id: 2, position: 1 });
  await expect(page.getByText("Movido para “Coluna curta”")).toBeVisible();
});

test("fora de produção: selo Dev ao lado do nome e (dev) no título da aba", async ({ page }) => {
  await openLongBoard(page);
  await expect(page.getByTitle(/Ambiente de desenvolvimento/)).toHaveText("Dev");
  await expect(page).toHaveTitle("Tododay (dev)");
  await expect(page.getByText("Beta", { exact: true })).toHaveCount(0);
});

test("menu: Enviar feedback abre um e-mail para o app com a versão e a plataforma", async ({ page }) => {
  await openLongBoard(page);
  await page.getByRole("button", { name: "Menu" }).click();
  const link = page.getByRole("menuitem", { name: "Enviar feedback" });
  const href = (await link.getAttribute("href")) ?? "";
  expect(href.startsWith("mailto:todoapp70@gmail.com?")).toBe(true);
  expect(new URLSearchParams(href.split("?")[1]).get("body")).toMatch(/Tododay \d+\.\d+\.\d+ \(web\)$/);
});

test("membro usa o board, mas não vê os controles da estrutura (colunas e boards são do admin)", async ({ page }) => {
  await openLongBoard(page, "/", {
    team_member: [{ role: "member", team: { id: 1, name: "Equipe E2E", created_by: USER_ID, created_at: NOW } }],
  });
  await expect(page.getByPlaceholder("Novo card...").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar coluna" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Novo board" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Configurações da coluna/ })).toHaveCount(0);
});

test("convite por e-mail: admin convida, vê o convite pendente e gera um link de acesso", async ({ page }) => {
  const PENDING_ID = "00000000-0000-0000-0000-000000000002";
  const calls: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/members", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    if (body.action === "invite") return route.fulfill({ json: { status: "invited", userId: PENDING_ID } });
    if (body.action === "pending") return route.fulfill({ json: { userIds: [PENDING_ID] } });
    return route.fulfill({ json: { link: "https://exemplo.supabase.co/auth/v1/verify?token=abc&type=recovery" } });
  });
  await mockSession(page);
  await page.route("**/rest/v1/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("team_member") && url.searchParams.get("select")?.includes("profile")) {
      return route.fulfill({
        json: [
          { team_id: 1, user_id: USER_ID, role: "admin", job_title: "", joined_at: NOW, deactivated_at: null, profile: { email: env.E2E_EMAIL, display_name: "E2E" } },
          { team_id: 1, user_id: PENDING_ID, role: "member", job_title: "", joined_at: NOW, deactivated_at: null, profile: { email: "carla@exemplo.com", display_name: "Carla" } },
        ],
      });
    }
    return fulfillRest(route);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Equipe" }).click();

  await page.getByLabel("E-mail").fill("carla@exemplo.com");
  await page.getByLabel("Nome").fill("Carla");
  await page.getByRole("button", { name: "Convidar" }).click();
  await expect(page.getByText(/Convite enviado para carla@exemplo.com/)).toBeVisible();
  expect(calls.find((c) => c.action === "invite")).toMatchObject({ teamId: 1, email: "carla@exemplo.com", name: "Carla", role: "member" });

  await expect(page.getByText("· convite pendente")).toBeVisible();
  await page.getByRole("button", { name: "Gerar link de acesso" }).click();
  await expect(page.getByText(/auth\/v1\/verify\?token=abc/)).toBeVisible();
  expect(calls.find((c) => c.action === "link")).toMatchObject({ teamId: 1, userId: PENDING_ID });
});

test("perfil: salvar o nome manda só o nome aparado, e nome vazio não salva", async ({ page }) => {
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

const dayFromToday = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("Minhas tarefas: cards meus por prazo, sem os concluídos e arquivados, e o clique abre o card", async ({ page }) => {
  const task = (id: number, title: string, due_date: string | null) => ({
    id,
    title,
    due_date,
    priority: null,
    board_id: 1,
    board: { name: "Board E2E" },
    list: { name: "Coluna longa" },
  });
  await openLongBoard(page, "/", { myTasks: [task(3, "Card 3", dayFromToday(-1)), task(5, "Card 5", dayFromToday(0)), task(7, "Card 7", null)] });
  await page.getByRole("button", { name: "Menu" }).click();
  const request = page.waitForRequest((r) => r.url().includes("/rest/v1/card") && decodeURIComponent(r.url()).includes("board!inner"));
  await page.getByRole("menuitem", { name: "Minhas tarefas" }).click();
  const url = new URL((await request).url());
  expect(url.searchParams.get("assignee_id")).toBe(`eq.${USER_ID}`);
  expect(url.searchParams.get("archived_at")).toBe("is.null");
  expect(url.searchParams.get("list.status")).toBe("neq.done");
  expect(url.searchParams.get("board.team_id")).toBe("eq.1");
  await expect(page.getByRole("heading", { name: /Atrasadas/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Hoje/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Sem prazo/ })).toBeVisible();
  await page.getByRole("button", { name: /Card 5/ }).click();
  await expect(page.getByRole("dialog", { name: "Card 5" })).toBeVisible();
});

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
  await expect(dialog.getByText(/Gerar link de acesso/)).toBeVisible();
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
  await expect(dialog.getByText(/troque a senha/)).toBeVisible();
  await expect(dialog.getByText(/Gerar link de acesso/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Ver minhas tarefas" }).click();
  await expect(page.getByRole("heading", { name: "Minhas tarefas" })).toBeVisible();
});
