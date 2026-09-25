import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { getMyProfile, onSessionChange } from "../db/auth";

/** undefined enquanto o Supabase ainda restaura a sessão salva. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => onSessionChange(setSession), []);
  return session;
}

export function useProfile(userId: string) {
  return useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getMyProfile(userId),
  });
}
