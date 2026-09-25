import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

const host = process.env.TAURI_DEV_HOST;

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

export default defineConfig(({ mode }) => {
  if (mode === "desktop") assertDesktopEnv();
  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
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
