import { useSyncExternalStore } from "react";
import { filtersToSearch, parseFilters, type BoardFilters } from "../lib/boardFilters";

// Os filtros do board moram na query string: um link com ?responsavel=ana abre o board filtrado.
// replaceState (não push): digitar na busca não enche o histórico do navegador.
const CHANGE = "tododay:filters";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

export function setBoardFilters(filters: BoardFilters) {
  const { pathname, search, hash } = window.location;
  window.history.replaceState(null, "", pathname + filtersToSearch(filters, search) + hash);
  window.dispatchEvent(new Event(CHANGE));
}

export function useBoardFilters(): [BoardFilters, (filters: BoardFilters) => void] {
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  return [parseFilters(search), setBoardFilters];
}
