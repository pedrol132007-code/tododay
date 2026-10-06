import type { Page } from "@playwright/test";
import { readEnv } from "./seed";

// Sessão falsa para os testes que simulam o Supabase (layout, anexos): vai direto no localStorage,
// então roda sem a conta E2E e sem banco.

export const env = readEnv();
export const USER_ID = "00000000-0000-0000-0000-000000000001";

function fakeJwt() {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER_ID, role: "authenticated", exp: 4102444800 })}.x`;
}

export async function mockSession(page: Page) {
  const ref = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
  const session = {
    access_token: fakeJwt(),
    refresh_token: "fake",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 4102444800,
    user: { id: USER_ID, email: env.E2E_EMAIL, aud: "authenticated", role: "authenticated" },
  };
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [`sb-${ref}-auth-token`, JSON.stringify(session)]);
  // Os testes começam como quem já viu as boas-vindas; os testes delas apagam a chave.
  await page.addInitScript(() => localStorage.setItem("tododay.welcomed", "1"));
}
