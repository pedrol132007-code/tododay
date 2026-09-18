import { useQuery } from "@tanstack/react-query";
import { searchCards } from "../db/search";

export function useSearch(query: string) {
  return useQuery({
    queryKey: ["search", query],
    queryFn: () => searchCards(query),
    enabled: query.trim().length > 0,
  });
}
