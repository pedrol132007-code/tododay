// Manifesto do backup: `node scripts/backup-dados.mjs contar dados.sql` imprime "schema.tabela<TAB>n"
// (só contagens, nunca dados: o log do Actions é público).
import { readFileSync } from "node:fs";
import { countRows, formatManifest } from "../src/lib/backupManifest.ts";

const [cmd, file] = process.argv.slice(2);
if (cmd !== "contar" || !file) throw new Error("Uso: node scripts/backup-dados.mjs contar <dados.sql>");
process.stdout.write(formatManifest(countRows(readFileSync(file, "utf8"))));
