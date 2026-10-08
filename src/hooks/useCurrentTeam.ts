import { createContext, useContext } from "react";

interface CurrentTeam {
  teamId: number;
  /**
   * Admin ou member. Leitores (viewer) só enxergam: a RLS já bloqueia a escrita, isto só
   * esconde os controles.
   */
  canEdit: boolean;
  /** Só admin exclui boards (a RLS também só deixa admin). */
  isAdmin: boolean;
  /**
   * Admin ou líder (0020): cria e renomeia boards, escolhe as pessoas de cada board e muda tipo,
   * limite e exclusão de colunas. A RLS garante; isto só mostra os controles.
   */
  canManageBoards: boolean;
}

export const CurrentTeamContext = createContext<CurrentTeam | null>(null);

function useCurrentTeam(): CurrentTeam {
  const team = useContext(CurrentTeamContext);
  if (!team) throw new Error("useCurrentTeam fora de CurrentTeamContext.Provider");
  return team;
}

export function useCanEdit(): boolean {
  return useCurrentTeam().canEdit;
}

export function useIsAdmin(): boolean {
  return useCurrentTeam().isAdmin;
}

export function useCanManageBoards(): boolean {
  return useCurrentTeam().canManageBoards;
}

export function useCurrentTeamId(): number {
  return useCurrentTeam().teamId;
}
