// Edge Function "members" (Deno, no Supabase): convites por e-mail. Cole este arquivo no editor de
// Edge Functions do painel com o nome "members". Precisa da chave service_role (o Supabase a
// fornece em SUPABASE_SERVICE_ROLE_KEY), que nunca vai para o app.
//
// Ações (POST, JSON, com o token de quem está logado; só admin ATIVO da equipe):
//   { action: "invite", teamId, email, name, role, jobTitle } → quem não tem conta recebe o e-mail de
//     convite e entra na equipe (define a senha pelo link); quem já tem conta só entra na equipe.
//   { action: "pending", teamId } → ids dos membros que ainda não definiram senha.
//   { action: "link", teamId, userId, redirectTo } → link para definir a senha, para o admin mandar
//     por outro canal quando o e-mail não chega. Só para quem ainda não tem senha: assim um admin
//     nunca consegue entrar na conta de quem já usa o app.
// O link vale o tempo de "Email OTP expiration" (Authentication → Providers → Email).
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const ROLES = ["admin", "member", "viewer"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Body = {
  action?: string;
  teamId?: unknown;
  userId?: unknown;
  email?: unknown;
  name?: unknown;
  role?: unknown;
  jobTitle?: unknown;
  redirectTo?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return reply({ error: "Sua sessão expirou. Entre de novo." }, 401);

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Pedido inválido." }, 400);
  }

  const teamId = Number(body.teamId);
  if (!Number.isSafeInteger(teamId)) return reply({ error: "Pedido inválido." }, 400);
  // team_role pela RLS de quem chamou: desativado ou de fora da equipe não passa.
  const { data: role } = await asUser.rpc("team_role", { p_team_id: teamId });
  if (role !== "admin") return reply({ error: "Só o admin da equipe pode fazer isso." }, 403);

  try {
    if (body.action === "invite") return await invite(admin, teamId, auth.user.id, body);
    if (body.action === "pending") return reply({ userIds: await pendingIds(admin, teamId) });
    if (body.action === "link") return await link(admin, teamId, body);
    return reply({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error(e);
    return reply({ error: "Erro no servidor ao tratar o convite." }, 500);
  }
});

function redirectOf(body: Body): string | undefined {
  return typeof body.redirectTo === "string" && /^https?:\/\//.test(body.redirectTo) ? body.redirectTo : undefined;
}

async function invite(admin: SupabaseClient, teamId: number, actorId: string, body: Body): Promise<Response> {
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const jobTitle = typeof body.jobTitle === "string" ? body.jobTitle.trim() : "";
  const role = typeof body.role === "string" && ROLES.includes(body.role) ? body.role : null;
  if (!EMAIL.test(email) || !role) return reply({ error: "Confira o e-mail e o papel." }, 400);

  const { data: existing } = await admin.from("profile").select("id").eq("email", email).maybeSingle();
  let userId: string;
  let status: "invited" | "added";
  if (existing) {
    const { data: member } = await admin
      .from("team_member")
      .select("deactivated_at")
      .eq("team_id", teamId)
      .eq("user_id", existing.id)
      .maybeSingle();
    if (member) {
      return reply({ error: member.deactivated_at ? "Essa pessoa está desativada na equipe: reative em vez de convidar." : "Essa pessoa já está na equipe." }, 409);
    }
    userId = existing.id;
    status = "added";
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirectOf(body),
      data: name ? { display_name: name } : undefined,
    });
    if (error || !data.user) {
      console.error(error);
      return reply({ error: "Não foi possível enviar o convite. Confira o e-mail e tente de novo." }, 502);
    }
    userId = data.user.id;
    status = "invited";
  }

  const { error: insertError } = await admin
    .from("team_member")
    .insert({ team_id: teamId, user_id: userId, role, job_title: jobTitle });
  if (insertError) throw insertError;

  // Com a service_role o trigger de atividade não sabe quem agiu (auth.uid() vazio): registra aqui.
  const { data: names } = await admin.from("profile").select("id, display_name").in("id", [actorId, userId]);
  const nameOf = (id: string) => names?.find((p) => p.id === id)?.display_name ?? "?";
  await admin.from("activity").insert({
    team_id: teamId,
    actor_id: actorId,
    actor_name: nameOf(actorId),
    action: "member.invited",
    payload: { name: nameOf(userId), role },
  });
  return reply({ status, userId });
}

/** Membros da equipe que ainda não definiram senha (convite não aceito até o fim). */
async function pendingIds(admin: SupabaseClient, teamId: number): Promise<string[]> {
  const { data: members, error } = await admin.from("team_member").select("user_id").eq("team_id", teamId);
  if (error) throw error;
  return withoutPassword(admin, (members ?? []).map((m) => m.user_id));
}

// Abrir o link do convite já conta como entrada (last_sign_in_at): quem fechava antes de criar a
// senha ficava sem link e sem senha. Por isso o critério é a senha (0019_users_without_password).
async function withoutPassword(admin: SupabaseClient, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await admin.rpc("users_without_password", { p_ids: userIds });
  if (error) throw error;
  return (data ?? []) as string[];
}

async function link(admin: SupabaseClient, teamId: number, body: Body): Promise<Response> {
  const userId = typeof body.userId === "string" ? body.userId : "";
  const { data: member } = await admin
    .from("team_member")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return reply({ error: "Essa pessoa não está na equipe." }, 404);

  const { data: found } = await admin.auth.admin.getUserById(userId);
  if (!found.user?.email) return reply({ error: "Essa pessoa não está na equipe." }, 404);
  if ((await withoutPassword(admin, [userId])).length === 0) {
    return reply({ error: "Essa pessoa já tem senha. Para trocar, ela usa \"Esqueci minha senha\"." }, 409);
  }
  const redirectTo = redirectOf(body);
  if (!redirectTo) return reply({ error: "Pedido inválido." }, 400);

  // recovery: abre o app na tela de definir senha, e não invalida o link do e-mail de convite.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: found.user.email,
    options: { redirectTo },
  });
  if (error || !data.properties?.hashed_token) {
    console.error(error);
    return reply({ error: "Não foi possível gerar o link. Tente de novo." }, 502);
  }
  // Link para o próprio app, não para o /verify do Supabase: o token só é gasto quando a pessoa
  // clica no botão da página (src/lib/emailLink.ts). Antivírus de e-mail e prévias de chat abrem
  // links sozinhos e gastavam o token antes ("O link expirou ou já foi usado").
  return reply({ link: `${redirectTo}#token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery` });
}
