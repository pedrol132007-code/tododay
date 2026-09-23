import { must, supabase } from "./supabase";
import type { Board } from "../types";

export async function listBoards(teamId: number): Promise<Board[]> {
  return must(await supabase.from("board").select("*").eq("team_id", teamId).order("position"));
}

export async function createBoard(teamId: number, name: string): Promise<number> {
  const last = must(
    await supabase.from("board").select("position").eq("team_id", teamId).order("position", { ascending: false }).limit(1),
  );
  const position = (last[0]?.position ?? 0) + 1;
  const row = must(await supabase.from("board").insert({ team_id: teamId, name, position }).select("id").single());
  return row.id;
}
