import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { appOrigin } from "../lib/pendingInvite";
import type { MemberRole } from "../types";

// Convites por e-mail pela Edge Function "members" (supabase/functions/members): criar conta e mandar
// o e-mail precisa da service_role, que só existe lá. As regras (só admin ativo) também ficam lá.

export class MembersError extends Error {}

async function callMembers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("members", { body });
  if (error) {
    const message = error instanceof FunctionsHttpError ? ((await error.context.json().catch(() => null)) as { error?: string } | null)?.error : null;
    throw new MembersError(message ?? "Não foi possível falar com o servidor. Tente de novo.");
  }
  return data as T;
}

export interface MemberInvite {
  email: string;
  name: string;
  role: MemberRole;
  jobTitle: string;
}

/** "invited": recebeu o e-mail para definir a senha; "added": já tinha conta e só entrou na equipe. */
export async function inviteMember(teamId: number, invite: MemberInvite): Promise<"invited" | "added"> {
  const { status } = await callMembers<{ status: "invited" | "added" }>({
    action: "invite",
    teamId,
    ...invite,
    redirectTo: appOrigin,
  });
  return status;
}

/** Membros que ainda não entraram nenhuma vez (convite não aceito). */
export async function listPendingMembers(teamId: number): Promise<string[]> {
  const { userIds } = await callMembers<{ userIds: string[] }>({ action: "pending", teamId });
  return userIds;
}

/** Link para a pessoa definir a senha, para mandar por outro canal quando o e-mail não chega. */
export async function passwordLinkFor(teamId: number, userId: string): Promise<string> {
  const { link } = await callMembers<{ link: string }>({ action: "link", teamId, userId, redirectTo: appOrigin });
  return link;
}
