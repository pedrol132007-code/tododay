import { defineConfig } from "@playwright/test";
import mock from "./playwright.mock.config";

// Os mesmos testes simulados (sem banco), mas contra o build de produção servido com os cabeçalhos
// do vercel.json, CSP inclusive: se a política bloquear algo que o app usa, um teste quebra.
// `npm run test:e2e:csp`.
export default defineConfig({
  ...mock,
  testMatch: [...(mock.testMatch as string[]), "csp.spec.ts"],
  testIgnore: [],
  use: { ...mock.use, baseURL: "http://localhost:1431" },
  webServer: {
    command: "npm run build && npx vite preview --port 1431 --strictPort",
    url: "http://localhost:1431",
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
