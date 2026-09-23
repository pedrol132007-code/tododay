import { createContext, useContext } from "react";

/**
 * Se o usuário pode editar os boards da equipe ativa (admin ou member). Leitores (viewer)
 * só enxergam: a RLS já bloqueia a escrita, isto só esconde os controles.
 */
export const CanEditContext = createContext(true);

export function useCanEdit(): boolean {
  return useContext(CanEditContext);
}
