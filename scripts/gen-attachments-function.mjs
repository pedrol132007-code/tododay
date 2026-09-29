// Gera supabase/functions/attachments/index.ts: o handler.ts com as regras de
// src/lib/attachmentRules.ts embutidas no lugar do import, num arquivo só, para colar no editor
// de Edge Functions do painel do Supabase (não usamos a CLI). Rode: npm run gen:function
import { readFileSync, writeFileSync } from "node:fs";

const RULES = "src/lib/attachmentRules.ts";
const HANDLER = "supabase/functions/attachments/handler.ts";
const OUT = "supabase/functions/attachments/index.ts";
const IMPORT = /^import \{[^}]*\} from "\.\.\/\.\.\/\.\.\/src\/lib\/attachmentRules\.ts";\r?\n/m;

const handler = readFileSync(HANDLER, "utf8");
if (!IMPORT.test(handler)) throw new Error(`${HANDLER} não importa as regras como esperado`);
const rules = readFileSync(RULES, "utf8");

writeFileSync(
  OUT,
  `// GERADO por scripts/gen-attachments-function.mjs a partir de handler.ts e de ${RULES}.\n` +
    `// Não edite à mão: mude as fontes e rode npm run gen:function.\n\n` +
    handler.replace(IMPORT, () => `\n// ─── Regras (${RULES}) ───\n\n${rules}\n// ─── Função ───\n\n`),
);
console.log(`${OUT} gerado`);
