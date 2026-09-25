import { must, supabase } from "./supabase";
import type { Activity } from "../types";

export async function listCardActivity(cardId: number): Promise<Activity[]> {
  return must(
    await supabase.from("activity").select("*").eq("card_id", cardId).order("created_at", { ascending: false }).limit(50),
  );
}

export async function listTeamActivity(teamId: number): Promise<Activity[]> {
  return must(
    await supabase.from("activity").select("*").eq("team_id", teamId).order("created_at", { ascending: false }).limit(100),
  );
}
