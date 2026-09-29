// Edge Function "attachments" (Deno, no Supabase). Fonte de verdade; o index.ts ao lado é gerado a
// partir deste arquivo com as regras embutidas (npm run gen:function), para colar no painel.
//
// Ações (POST, JSON, com o token de quem está logado):
//   { action: "finalize", cardId, path, name } → confere o arquivo já enviado ao Storage e grava os
//     metadados; se não passar, apaga o arquivo e devolve o motivo.
//   { action: "purge" } → apaga do Storage os arquivos da lixeira e os envios que nunca foram aprovados.
//
// A chave service_role só existe aqui dentro (o Supabase a fornece em SUPABASE_SERVICE_ROLE_KEY).
// Dois imports separados: o empacotador do painel não aceita "type" dentro das chaves.
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { checkAttachment, cleanFileName, MAX_ATTACHMENT_BYTES, PROBLEM_TEXT } from "../../../src/lib/attachmentRules.ts";

const BUCKET = "attachments";
const PATH = /^([0-9]{1,18})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Cliente com o token de quem chamou: as perguntas de permissão passam pela RLS dessa pessoa.
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return reply({ error: "Sua sessão expirou. Entre de novo." }, 401);

  let body: { action?: string; cardId?: unknown; path?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Pedido inválido." }, 400);
  }

  try {
    if (body.action === "finalize") return await finalize(admin, asUser, auth.user.id, body);
    if (body.action === "purge") return reply(await purge(admin));
    return reply({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error(e);
    return reply({ error: "Erro no servidor ao tratar o anexo." }, 500);
  }
});

async function finalize(
  admin: SupabaseClient,
  asUser: SupabaseClient,
  userId: string,
  body: { cardId?: unknown; path?: unknown; name?: unknown },
): Promise<Response> {
  const cardId = Number(body.cardId);
  const path = typeof body.path === "string" ? body.path : "";
  const match = PATH.exec(path);
  if (!Number.isSafeInteger(cardId) || !match || Number(match[1]) !== cardId || typeof body.name !== "string") {
    return reply({ error: "Pedido inválido." }, 400);
  }

  const discard = () => admin.storage.from(BUCKET).remove([path]);

  // Mesma regra da policy de envio: só quem edita o card (admin ou membro da equipe).
  const { data: role } = await asUser.rpc("card_role", { p_card_id: cardId });
  if (role !== "admin" && role !== "member") {
    await discard();
    return reply({ error: "Você não pode anexar arquivos neste card." }, 403);
  }

  const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(path);
  if (downloadError || !blob) return reply({ error: "O arquivo não chegou ao servidor. Tente de novo." }, 404);
  if (blob.size > MAX_ATTACHMENT_BYTES) {
    await discard();
    return reply({ error: PROBLEM_TEXT.tooLarge, problem: "tooLarge" }, 422);
  }

  const name = cleanFileName(body.name);
  const check = checkAttachment(name, new Uint8Array(await blob.arrayBuffer()));
  if (!check.ok) {
    await discard();
    return reply({ error: PROBLEM_TEXT[check.problem], problem: check.problem }, 422);
  }

  const { data: profile } = await admin.from("profile").select("display_name").eq("id", userId).single();
  const { data: row, error: insertError } = await admin
    .from("card_attachment")
    .insert({
      card_id: cardId,
      name,
      mime_type: check.mime,
      size_bytes: blob.size,
      storage_path: path,
      uploaded_by: userId,
      uploaded_by_name: profile?.display_name ?? "?",
    })
    .select()
    .single();
  if (insertError) {
    // O card pode ter sido excluído no meio do envio.
    await discard();
    return reply({ error: "Não foi possível salvar o anexo. O card ainda existe?" }, 409);
  }
  return reply(row);
}

/** Esvazia a lixeira e apaga envios nunca aprovados com mais de um dia. */
async function purge(admin: SupabaseClient): Promise<{ removed: number }> {
  const { data: trash } = await admin.from("attachment_trash").select("storage_path").limit(1000);
  const { data: orphans } = await admin.rpc("attachment_orphans", { p_older_than: "1 day" });
  const paths = [...(trash ?? []), ...((orphans as { storage_path: string }[] | null) ?? [])].map((r) => r.storage_path);

  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    // Caminho que já não existe no Storage não dá erro: some da lixeira do mesmo jeito.
    const { error } = await admin.storage.from(BUCKET).remove(batch);
    if (error) throw error;
    await admin.from("attachment_trash").delete().in("storage_path", batch);
    removed += batch.length;
  }
  return { removed };
}
