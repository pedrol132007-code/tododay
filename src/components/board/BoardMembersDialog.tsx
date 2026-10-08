import { useEffect } from "react";
import { motion } from "framer-motion";
import { seesAllBoards, useBoardMemberIds, useSetBoardMember } from "../../hooks/useBoardMembers";
import { useTeamMembers } from "../../hooks/useTeams";
import { Avatar } from "../ui/Avatar";
import type { Board } from "../../types";

interface BoardMembersDialogProps {
  board: Pick<Board, "id" | "team_id" | "name">;
  onClose: () => void;
}

/** Quem participa do board (0020). Admin e líder veem todos os boards: aparecem marcados, sem caixa. */
export function BoardMembersDialog({ board, onClose }: BoardMembersDialogProps) {
  const { data: members } = useTeamMembers(board.team_id);
  const { data: ids } = useBoardMemberIds(board.id);
  const setMember = useSetBoardMember(board.id);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const people = (members ?? []).filter((m) => !m.deactivated_at || ids?.includes(m.user_id));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-24">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-members-title"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15 }}
        className="relative flex max-h-[70vh] w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-bg-surface p-6"
      >
        <div>
          <h2 id="board-members-title" className="text-lg font-semibold text-text-primary">
            Pessoas do board “{board.name}”
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Só quem está marcado vê este board. Quem sai deixa de ser responsável pelos cards dele aqui.
          </p>
        </div>
        <ul className="-mx-2 flex min-h-0 flex-col overflow-y-auto">
          {people.map((member) => {
            const all = seesAllBoards(member);
            const checked = all || !!ids?.includes(member.user_id);
            return (
              <li key={member.user_id}>
                <label className={`flex items-center gap-3 rounded-lg px-2 py-2 ${all ? "" : "cursor-pointer hover:bg-bg-elevated"}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={all || !ids || setMember.isPending}
                    onChange={(e) => setMember.mutate({ userId: member.user_id, member: e.target.checked })}
                    aria-label={member.profile.display_name}
                    className="h-4 w-4 accent-primary"
                  />
                  <Avatar
                    userId={member.user_id}
                    name={member.profile.display_name}
                    avatarUrl={member.profile.avatar_url}
                    leader={member.is_leader}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text-primary">{member.profile.display_name}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {all
                        ? `${member.is_leader ? "Líder" : "Admin"}: vê todos os boards`
                        : member.role === "viewer"
                          ? "Leitor: só lê"
                          : member.deactivated_at
                            ? "Desativado"
                            : member.job_title}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {setMember.error && <p className="text-sm text-danger">{(setMember.error as Error).message}</p>}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary px-4 py-2">
            Pronto
          </button>
        </div>
      </motion.div>
    </div>
  );
}
