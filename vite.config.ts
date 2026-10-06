import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import pkg from "./package.json";

const host = process.env.TAURI_DEV_HOST;

// Commit publicado (a Vercel define no build); "local" fora dela. Liga o erro do Sentry à versão.
const release = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
// Source maps vão para o Sentry só no build da Vercel com o token (nunca no app); depois do envio
// os .map são apagados do dist, para não ficarem públicos. Sem o token, build normal sem mapas.
const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN);

// O instalador desktop embute as variáveis na hora do build. No modo "desktop" (npm run
// desktop:build) elas precisam vir todas do .env.desktop, senão o app cairia nas chaves de
// dev do .env e os convites apontariam para http://tauri.localhost.
const DESKTOP_KEYS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY", "VITE_PUBLIC_URL"];

function assertDesktopEnv() {
  const file = ".env.desktop";
  if (!fs.existsSync(file)) {
    throw new Error(`Build desktop sem ${file}. Copie .env.desktop.example e preencha com o projeto de produção.`);
  }
  const text = fs.readFileSync(file, "utf8");
  const missing = DESKTOP_KEYS.filter((key) => !new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(text));
  if (missing.length > 0) throw new Error(`${file} sem valor para: ${missing.join(", ")}`);
}

// Os cabeçalhos de segurança do site (CSP, HSTS...) ficam só no vercel.json; o `vite preview` usa
// os mesmos, para testar o build com eles (npm run test:e2e:csp).
const vercelHeaders: Record<string, string> = Object.fromEntries(
  (JSON.parse(fs.readFileSync("vercel.json", "utf8")).headers as { headers: { key: string; value: string }[] }[])
    .flatMap((h) => h.headers)
    .filter((h) => h.key !== "Strict-Transport-Security")
    .map((h) => [h.key, h.value]),
);

export default defineConfig(({ mode }) => {
  if (mode === "desktop") assertDesktopEnv();
  return {
    plugins: [
      react(),
      sentryUpload &&
        sentryVitePlugin({
          authToken: process.env.SENTRY_AUTH_TOKEN,
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          release: { name: release },
          sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
          telemetry: false,
        }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_RELEASE__: JSON.stringify(release),
    },
    build: {
      sourcemap: sentryUpload ? "hidden" : false,
      rollupOptions: {
        output: {
          // Bibliotecas em arquivos próprios: mudam pouco, então o navegador reaproveita o cache
          // entre deploys e só baixa de novo o código do app.
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
            if (id.includes("@supabase")) return "supabase";
            if (/framer-motion|motion-dom|motion-utils/.test(id)) return "motion";
            if (id.includes("@dnd-kit")) return "dnd";
            if (id.includes("@tanstack")) return "query";
          },
        },
      },
    },
    preview: { headers: vercelHeaders },
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? { protocol: "ws", host, port: 1421 }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
