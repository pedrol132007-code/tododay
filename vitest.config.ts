import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // e2e/ é do Playwright (npm run test:e2e).
    include: ["src/**/*.test.ts"],
  },
});
