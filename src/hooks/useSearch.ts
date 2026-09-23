import { useQuery } from "@tanstack/react-query";
import { search } from "../db/search";

export function useSearch(teamId: number, query: string) {
  return useQuery({
    queryKey: ["search", teamId, query],
    queryFn: () => search(teamId, query),
    enabled: query.trim().length > 0,
  });
}
