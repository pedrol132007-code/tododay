// Resolved at build time in vite.config.ts from TAURI_ENV_DEBUG, which the Tauri CLI sets from
// the Rust build profile — the same signal as main.rs's cfg!(debug_assertions). Deciding from
// Vite's own DEV flag instead would disagree with Rust under `tauri build --debug`.
export function dbUrlFor(tauriEnvDebug: string | undefined): string {
  return tauriEnvDebug === "true" ? "sqlite:kanban-dev.db" : "sqlite:kanban.db";
}
