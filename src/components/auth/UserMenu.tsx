import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "../../db/auth";
import { useProfile } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import type { ThemePref } from "../../lib/theme";

const THEME_LABEL: Record<ThemePref, string> = { system: "Tema: sistema", light: "Tema: claro", dark: "Tema: escuro" };

export function UserMenu({ userId }: { userId: string }) {
  const { data: profile } = useProfile(userId);
  const queryClient = useQueryClient();
  const theme = useTheme();

  async function handleSignOut() {
    await signOut();
    queryClient.clear();
  }

  return (
    <div className="mr-4 flex shrink-0 items-center gap-2">
      {profile && (
        <span className="text-sm text-text-muted" title={profile.email}>
          {profile.display_name}
        </span>
      )}
      <button
        type="button"
        onClick={theme.cycle}
        title="Alternar entre sistema, claro e escuro"
        className="rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
      >
        {THEME_LABEL[theme.pref]}
      </button>
      <button
        type="button"
        onClick={handleSignOut}
        className="rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
      >
        Sair
      </button>
    </div>
  );
}
