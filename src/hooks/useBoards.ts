import { useQuery } from "@tanstack/react-query";
import { listBoards } from "../db/boards";

export function useBoards() {
  return useQuery({
    queryKey: ["boards"],
    queryFn: listBoards,
  });
}
