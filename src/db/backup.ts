import { getDb } from "./client";

// VACUUM INTO writes a consistent snapshot (WAL included) while the app keeps the database
// open — copying the file directly could catch it mid-write.
export async function backupDatabase(destPath: string): Promise<void> {
  const db = await getDb();
  await db.execute("VACUUM INTO $1", [destPath]);
}
