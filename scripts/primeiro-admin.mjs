// npm run admin:primeiro — cria a primeira equipe de um projeto Supabase e convida o primeiro admin.
// Rode uma vez, no seu computador, depois de aplicar as migrations no projeto de produção.
//
// Pergunta tudo na hora e não grava nada: a chave service_role é digitada (sem aparecer na tela) e
// só fica na memória enquanto o script roda. Nenhuma senha é criada aqui: a pessoa recebe o e-mail
// de convite e define a própria senha. Se o e-mail não chegar, o script mostra um link de acesso.
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

console.log("Primeiro admin do Tododay. Nada do que você digitar fica gravado.\n");
const url = (await ask("URL do Supabase (https://<ref>.supabase.co): ")).replace(/\/+$/, "");
if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url)) fail("URL inválida. Copie de Project Settings → API.");
const serviceKey = await ask("Chave service_role (Project Settings → API; não aparece ao digitar): ", { hidden: true });
if (!serviceKey) fail("Sem a chave service_role não dá para criar o convite.");
const site = (await ask("Endereço do site (ex.: https://tododay-nu.vercel.app): ")).replace(/\/+$/, "");
if (!/^https?:\/\//.test(site)) fail("Endereço do site inválido.");
const email = (await ask("E-mail do primeiro admin: ")).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("E-mail inválido.");
const name = await ask("Nome dessa pessoa: ");
const teamName = await ask("Nome da equipe: ");
if (!teamName) fail("A equipe precisa de um nome.");

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: existing, error: lookupError } = await admin.from("profile").select("id").eq("email", email).maybeSingle();
if (lookupError) fail(`Não consegui ler o banco (${lookupError.message}). Confira a chave e se as migrations foram aplicadas.`);

let userId = existing?.id;
if (userId) {
  console.log(`\n${email} já tem conta: só vai virar admin da equipe nova.`);
} else {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: site,
    data: name ? { display_name: name } : undefined,
  });
  if (error || !data.user) fail(`Não consegui enviar o convite (${error?.message}).`);
  userId = data.user.id;
  console.log(`\n✓ Convite enviado para ${email}.`);
}

const { data: team, error: teamError } = await admin.from("team").insert({ name: teamName, created_by: userId }).select("id").single();
if (teamError) fail(`Não consegui criar a equipe (${teamError.message}).`);
const { error: memberError } = await admin.from("team_member").insert({ team_id: team.id, user_id: userId, role: "admin" });
if (memberError) fail(`Equipe criada, mas não consegui pôr ${email} como admin (${memberError.message}).`);
console.log(`✓ Equipe "${teamName}" criada, com ${email} como admin.`);

if (!existing) {
  const { data: link } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: site } });
  if (link?.properties?.action_link) {
    console.log("\nSe o e-mail não chegar (veja o lixo eletrônico), abra este link para definir a senha.");
    console.log("Ele vale por pouco tempo e uma vez só; não compartilhe:\n");
    console.log(link.properties.action_link);
  }
}
console.log("\nPronto. Daqui em diante, os convites saem da tela Equipe do app.");
