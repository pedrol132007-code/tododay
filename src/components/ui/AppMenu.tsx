import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "../../db/auth";
import { useProfile } from "../../hooks/useAuth";
import { Avatar } from "./Avatar";
import { IconCheck, IconChevronDown, IconSettings, IconSignOut, IconUsers } from "./icons";

export type AppView = "board" | "archive" | "team" | "settings" | "dashboard";

interface AppMenuProps {
  userId: string;
  view: AppView;
  onNavigate: (view: AppView) => void;
}

/** Menu da pessoa, no canto superior direito: o que se usa de vez em quando (equipe, preferências, sair). */
export function AppMenu({ userId, view, onNavigate }: AppMenuProps) {
  const { data: profile } = useProfile(userId);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function go(target: AppView) {
    setOpen(false);
    onNavigate(target);
  }

  async function handleSignOut() {
    await signOut();
    queryClient.clear();
  }

  const name = profile?.display_name ?? "";

  return (
    <div ref={ref} className="relative mr-4 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl px-2 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
      >
        {profile && <Avatar userId={userId} name={name} title="" />}
        <span className="max-w-40 truncate">{name}</span>
        <IconChevronDown size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-60 rounded-xl border border-border bg-bg-surface p-1 shadow-lg">
          {profile && (
            <div className="border-b border-border px-3 pb-2 pt-1.5">
              <div className="truncate text-sm font-semibold text-text-primary">{name}</div>
              <div className="truncate text-xs text-text-muted">{profile.email}</div>
            </div>
          )}
          <div className="flex flex-col py-1">
            <Item view={view} onGo={go} target="team" icon={<IconUsers size={16} />}>Equipe</Item>
            <Item view={view} onGo={go} target="settings" icon={<IconSettings size={16} />}>Configurações</Item>
          </div>
          <div className="border-t border-border pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            >
              <IconSignOut size={16} />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Item({
  view,
  onGo,
  target,
  icon,
  children,
}: {
  view: AppView;
  onGo: (target: AppView) => void;
  target: AppView;
  icon: ReactNode;
  children: ReactNode;
}) {
  const current = view === target;
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => onGo(target)}
      aria-current={current ? "page" : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-bg-elevated ${
        current ? "text-text-primary" : "text-text-muted hover:text-text-primary"
      }`}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {current && <IconCheck size={14} className="text-primary" />}
    </button>
  );
}
