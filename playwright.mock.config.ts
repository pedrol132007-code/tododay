import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Só os testes que simulam o Supabase (e2e/mockSession.ts): rodam sem banco nem conta E2E, então
// sem o global-setup que semeia o Postgres de DEV. `npm run test:e2e:mock`.
export default defineConfig({
  ...base,
  globalSetup: undefined,
  testMatch: ["layout.spec.ts", "attachments.spec.ts"],
});
