import Database from "@tauri-apps/plugin-sql";

// Must match the URL main.rs registers migrations for (kanban-dev.db in debug builds).
const DB_URL = import.meta.env.DEV ? "sqlite:kanban-dev.db" : "sqlite:kanban.db";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_URL);
  }
  return dbPromise;
}
