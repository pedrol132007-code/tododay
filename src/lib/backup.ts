const pad = (n: number) => String(n).padStart(2, "0");

export function backupFileName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `tododay-backup-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.db`;
}

// VACUUM INTO refuses to overwrite; the save dialog already asked "replace?", so the raw
// SQLite text would read as a bug. Everything else is shown as-is.
export function backupErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("output file already exists")) return "Esse arquivo já existe — escolha outro nome.";
  return `Não foi possível salvar o backup: ${text}`;
}
