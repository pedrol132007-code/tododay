import { expect, it } from "vitest";
import rules from "./attachmentRules.ts?raw";
import handler from "../../supabase/functions/attachments/handler.ts?raw";
import generated from "../../supabase/functions/attachments/index.ts?raw";

// O index.ts é o que vai para o painel do Supabase: precisa estar em dia com as regras e o handler.
it("a Edge Function gerada está em dia (senão: npm run gen:function)", () => {
  const normalize = (s: string) => s.replace(/\r\n/g, "\n");
  expect(normalize(generated)).toContain(normalize(rules));
  for (const part of normalize(handler).split(/^import \{[^}]*\} from "\.\.\/\.\.\/\.\.\/src\/lib\/attachmentRules\.ts";\n/m)) {
    expect(normalize(generated)).toContain(part);
  }
  expect(generated).not.toContain("src/lib/attachmentRules.ts\";");
});
