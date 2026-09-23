import Database from "@tauri-apps/plugin-sql";

// Injected by vite.config.ts (see src/lib/dbUrl.ts); matches the URL main.rs registers
// migrations for in every build mode.
const DB_URL = __DB_URL__;

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}
