import { must, supabase } from "./supabase";
import type { MemberRole, MyTeam, Profile, Team, TeamInvite, TeamMember } from "../types";

export async function listMyTeams(userId: string): Promise<MyTeam[]> {
  const rows = must(
    await supabase
      .from("team_member")
      .select("role, team(*)")
      .eq("user_id", userId)
      .returns<(Pick<TeamMember, "role"> & { team: Team })[]>(),
  );
  return rows
    .map(({ role, team }) => ({ ...team, role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createTeam(name: string): Promise<number> {
  return must(await supabase.rpc("create_team", { p_name: name }));
}

export async function renameTeam(teamId: number, name: string): Promise<void> {
  must(await supabase.from("team").update({ name }).eq("id", teamId));
}

export type TeamMemberWithProfile = TeamMember & { profile: Pick<Profile, "email" | "display_name"> };

export async function listTeamMembers(teamId: number): Promise<TeamMemberWithProfile[]> {
  const rows = must(
    await supabase
      .from("team_member")
      .select("*, profile(email, display_name)")
      .eq("team_id", teamId)
      .returns<TeamMemberWithProfile[]>(),
  );
  return rows.sort((a, b) => a.profile.display_name.localeCompare(b.profile.display_name));
}

export async function updateTeamMember(
  teamId: number,
  userId: string,
  changes: Partial<Pick<TeamMember, "role" | "job_title">>,
): Promise<void> {
  must(await supabase.from("team_member").update(changes).eq("team_id", teamId).eq("user_id", userId));
}

/** Remove alguém da equipe (admin) ou sai dela (o próprio usuário). */
export async function removeTeamMember(teamId: number, userId: string): Promise<void> {
  must(await supabase.from("team_member").delete().eq("team_id", teamId).eq("user_id", userId));
}

/** Links ainda utilizáveis: nem usados, nem cancelados, nem expirados. */
export async function listOpenInvites(teamId: number): Promise<TeamInvite[]> {
  return must(
    await supabase
      .from("team_invite")
      .select("*")
      .eq("team_id", teamId)
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  );
}

export async function createInvite(
  teamId: number,
  invite: Pick<TeamInvite, "label" | "role" | "job_title">,
): Promise<TeamInvite> {
  return must(await supabase.from("team_invite").insert({ team_id: teamId, ...invite }).select("*").single());
}

export async function revokeInvite(id: number): Promise<void> {
  must(await supabase.from("team_invite").update({ revoked_at: new Date().toISOString() }).eq("id", id));
}

export type InvitePreview = {
  team_name: string;
  role: MemberRole;
  status: "valid" | "used" | "expired" | "revoked" | "already_member";
};

/** null: o token não existe. */
export async function peekInvite(token: string): Promise<InvitePreview | null> {
  const rows: InvitePreview[] = must(await supabase.rpc("peek_invite", { p_token: token }));
  return rows[0] ?? null;
}

/** Entra na equipe do convite e devolve o id dela. */
export async function acceptInvite(token: string): Promise<number> {
  return must(await supabase.rpc("accept_invite", { p_token: token }));
}
