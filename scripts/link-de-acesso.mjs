// npm run admin:link — gera um link de acesso (definir senha) para quem ainda não consegue entrar,
// quando o e-mail não chega e não há admin logado para usar "Gerar link de acesso" na tela Equipe.
// Como o admin:primeiro, pede a service_role na hora e não grava nada. O link vai direto para a
// área de transferência (no terminal ele quebra a linha e chega cortado no navegador).
import { execFileSync } from "node:child_process";
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (text) => rl.output.write(text.startsWith(question) ? question : "");
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    }),
  );
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

const url = (await ask("URL do Supabase (https://<ref>.supabase.co): ")).replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url)) fail("URL inválida. Copie de Project Settings → API.");
const serviceKey = await ask("Chave service_role (não aparece ao digitar): ", { hidden: true });
const site = (await ask("Endereço do site (ex.: https://tododay-nu.vercel.app): ")).replace(/\/+$/, "");
if (!/^https?:\/\//.test(site)) fail("Endereço do site inválido.");
const email = (await ask("E-mail da pessoa: ")).toLowerCase();

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: site } });
const link = data?.properties?.action_link;
if (error || !link) fail(`Não consegui gerar o link (${error?.message ?? "sem link"}).`);

try {
  execFileSync(process.platform === "win32" ? "clip" : "pbcopy", { input: link });
  console.log("\n✓ Link copiado para a área de transferência. Cole na barra de endereço do navegador.");
} catch {
  console.log("\nNão consegui copiar; o link (uma linha só, copie inteiro):\n");
  console.log(link);
}
console.log("Ele vale por pouco tempo e uma vez só; não compartilhe.");
