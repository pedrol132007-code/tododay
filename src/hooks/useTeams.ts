import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptInvite,
  createTeam,
  listMyTeams,
  listOpenInvites,
  peekInvite,
  listTeamMembers,
  removeTeamMember,
  renameTeam,
  revokeInvite,
  updateTeamMember,
} from "../db/teams";
import { inviteMember, listPendingMembers, passwordLinkFor, type MemberInvite } from "../db/members";
import type { TeamMember } from "../types";

export function useMyTeams(userId: string) {
  return useQuery({
    queryKey: ["teams", userId],
    queryFn: () => listMyTeams(userId),
  });
}

export function useCreateTeam(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createTeam(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams", userId] }),
  });
}

export function useRenameTeam(teamId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameTeam(teamId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useTeamMembers(teamId: number) {
  return useQuery({
    queryKey: ["teamMembers", teamId],
    queryFn: () => listTeamMembers(teamId),
  });
}

export function useUpdateTeamMember(teamId: number) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["teamMembers", teamId] });
    // O próprio papel pode ter mudado; e a coroa muda quem vê todos os boards (0020).
    queryClient.invalidateQueries({ queryKey: ["teams"] });
    queryClient.invalidateQueries({ queryKey: ["boards", teamId] });
  };
  return useMutation({
    mutationFn: ({ userId, changes }: { userId: string; changes: Partial<Pick<TeamMember, "role" | "job_title" | "deactivated_at" | "is_leader">> }) =>
      updateTeamMember(teamId, userId, changes),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export function useRemoveTeamMember(teamId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeTeamMember(teamId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers", teamId] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
  });
}

export function useOpenInvites(teamId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["invites", teamId],
    queryFn: () => listOpenInvites(teamId),
    enabled,
  });
}

export function useInviteMember(teamId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invite: MemberInvite) => inviteMember(teamId, invite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamMembers", teamId] });
      queryClient.invalidateQueries({ queryKey: ["pendingMembers", teamId] });
    },
  });
}

/** Quem ainda não aceitou o convite (só o admin consulta). */
export function usePendingMembers(teamId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["pendingMembers", teamId],
    queryFn: () => listPendingMembers(teamId),
    enabled,
  });
}

export function usePasswordLink(teamId: number) {
  return useMutation({ mutationFn: (userId: string) => passwordLinkFor(teamId, userId) });
}

export function useRevokeInvite(teamId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => revokeInvite(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites", teamId] }),
  });
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ["invitePreview", token],
    queryFn: () => peekInvite(token),
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => acceptInvite(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["teams"] }),
  });
}
