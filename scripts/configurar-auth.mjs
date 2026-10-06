// npm run auth:configurar -- <dev|prod> [--aplicar] — configura o Auth do projeto pela Management API
// do Supabase: cadastro público (fechado no prod), validade dos links, senha mínima e os e-mails em PT
// de supabase/templates/. Sem --aplicar, só mostra o que mudaria.
//
// O token pessoal (supabase.com → Account → Access Tokens) é lido de um ARQUIVO, nunca da linha de
// comando nem do chat: SUPABASE_TOKEN_FILE=<caminho> (padrão: supabase-token.txt na Área de Trabalho).
// Nada é gravado. O script só imprime os campos que ele mesmo muda (nunca SMTP nem chaves).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PRODUCTION_PROJECT_REFS } from "../src/lib/environment.ts";

const PROJECTS = { dev: "aakskemifuzzgkbwuiup", prod: PRODUCTION_PROJECT_REFS[0] };
const [target, flag] = process.argv.slice(2);
const ref = PROJECTS[target];
if (!ref || (flag && flag !== "--aplicar")) throw new Error("Uso: npm run auth:configurar -- <dev|prod> [--aplicar]");

// O comentário do topo de cada template diz onde colar e o assunto; ele não vai no e-mail.
function template(file) {
  const html = readFileSync(join("supabase/templates", file), "utf8");
  const subject = html.match(/Assunto:\s*(.+?)\s*-->/)?.[1];
  if (!subject) throw new Error(`${file} sem "Assunto:" no comentário do topo.`);
  return { subject, content: html.replace(/^<!--[\s\S]*?-->\s*/, "") };
}
const invite = template("invite.html");
const recovery = template("reset_password.html");
const confirmation = template("confirm_signup.html");

const wanted = {
  disable_signup: target === "prod", // no dev fica aberto para testes e e2e
  mailer_otp_exp: 86400, // links de convite e de senha valem 24 h
  password_min_length: 8,
  mailer_subjects_invite: invite.subject,
  mailer_templates_invite_content: invite.content,
  mailer_subjects_recovery: recovery.subject,
  mailer_templates_recovery_content: recovery.content,
  mailer_subjects_confirmation: confirmation.subject,
  mailer_templates_confirmation_content: confirmation.content,
};

const tokenFile = process.env.SUPABASE_TOKEN_FILE ?? join(homedir(), "Desktop", "supabase-token.txt");
const token = readFileSync(tokenFile, "utf8").trim();
const api = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

const res = await fetch(api, { headers });
if (!res.ok) throw new Error(`Leitura da configuração falhou: HTTP ${res.status}`);
const current = await res.json();

const show = (v) => (typeof v === "string" && v.length > 60 ? `${v.length} caracteres` : JSON.stringify(v));
const changes = Object.keys(wanted).filter((k) => current[k] !== wanted[k]);
console.log(`Projeto ${target} (${ref}); site_url atual: ${current.site_url}\n`);
for (const k of Object.keys(wanted)) {
  console.log(`${changes.includes(k) ? "→" : "✓"} ${k}: ${show(current[k])}${changes.includes(k) ? ` ⇒ ${show(wanted[k])}` : ""}`);
}

if (!changes.length) console.log("\nNada a mudar.");
else if (flag !== "--aplicar") console.log(`\n${changes.length} campo(s) mudariam. Rode de novo com --aplicar.`);
else {
  const patch = await fetch(api, { method: "PATCH", headers, body: JSON.stringify(Object.fromEntries(changes.map((k) => [k, wanted[k]]))) });
  if (!patch.ok) throw new Error(`Gravação falhou: HTTP ${patch.status} ${await patch.text()}`);
  console.log(`\n✓ ${changes.length} campo(s) gravados.`);
}
