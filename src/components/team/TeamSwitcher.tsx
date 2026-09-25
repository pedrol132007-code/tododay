import { useEffect, useRef, useState } from "react";
import { CreateTeamForm } from "./CreateTeamForm";
import type { MyTeam } from "../../types";
import { IconPlus } from "../ui/icons";

interface TeamSwitcherProps {
  userId: string;
  teams: MyTeam[];
  activeTeamId: number;
  onSelect: (teamId: number) => void;
}

export function TeamSwitcher({ userId, teams, activeTeamId, onSelect }: TeamSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeTeam = teams.find((team) => team.id === activeTeamId);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function close() {
    setOpen(false);
    setCreating(false);
  }

  return (
    <div ref={ref} className="relative ml-4 shrink-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-1 rounded-xl px-3 py-1 text-sm font-semibold text-text-primary hover:bg-bg-elevated"
      >
        {activeTeam?.name}
        <span className="text-text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-64 rounded-xl border border-border bg-bg-surface p-2 shadow-lg">
          {creating ? (
            <div className="p-2">
              <CreateTeamForm
                userId={userId}
                onCreated={(id) => {
                  onSelect(id);
                  close();
                }}
                onCancel={() => setCreating(false)}
              />
            </div>
          ) : (
            <>
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => {
                    onSelect(team.id);
                    close();
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    team.id === activeTeamId ? "bg-bg-elevated text-text-primary" : "text-text-muted hover:bg-bg-elevated"
                  }`}
                >
                  <span className="truncate">{team.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-text-muted">{roleLabels[team.role]}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-1 flex w-full items-center gap-1 rounded-lg px-3 py-2 text-left text-sm text-text-muted hover:bg-bg-elevated"
              >
                <IconPlus size={14} /> Nova equipe
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const roleLabels: Record<MyTeam["role"], string> = {
  admin: "admin",
  member: "membro",
  viewer: "leitor",
};
