import { must, supabase } from "./supabase";
import type { SearchResult } from "../types";

/** Cards (título/descrição, não arquivados) e colunas de todos os boards da equipe. */
export async function search(teamId: number, query: string): Promise<SearchResult[]> {
  return must(await supabase.rpc("search_team", { p_team_id: teamId, p_query: query }));
}
