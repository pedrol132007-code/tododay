import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { getMyProfile, onSessionChange, updateDisplayName, updatePassword } from "../db/auth";

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

export function useUpdateDisplayName(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => updateDisplayName(userId, name),
    // O nome aparece no menu (profile) e em avatares, filtros e responsáveis (teamMembers).
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["teamMembers"] });
    },
  });
}

export function useUpdatePassword() {
  return useMutation({ mutationFn: (password: string) => updatePassword(password) });
}
