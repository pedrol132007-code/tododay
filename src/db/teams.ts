import { must, supabase } from "./supabase";
import type { MyTeam, Team, TeamMember } from "../types";

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
