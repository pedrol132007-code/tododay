import { useState } from "react";

// Colunas recolhidas de cada board, neste navegador/app (é só um jeito de ver a tela: não vai para
// o banco, e cada pessoa recolhe as suas). Sem localStorage, funciona até recarregar.
const keyOf = (board: string) => `tododay.collapsed.${board}`;

function read(board: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(keyOf(board)) ?? "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

/** [está recolhida?, alternar] para as colunas de um board ("12" no real, "demo" na demonstração). */
export function useCollapsedLists(board: string): [(listId: string | number) => boolean, (listId: string | number) => void] {
  // O board pode mudar sem a tela ser recriada: aí vale o que está guardado para o novo.
  const [state, setState] = useState(() => ({ board, ids: read(board) }));
  const collapsed = state.board === board ? state.ids : read(board);
  const toggle = (listId: string | number) => {
    const id = String(listId);
    const next = collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id];
    setState({ board, ids: next });
    try {
      localStorage.setItem(keyOf(board), JSON.stringify(next));
    } catch {
      // Só uma conveniência: sem storage, vale até recarregar.
    }
  };
  return [(listId) => collapsed.includes(String(listId)), toggle];
}
