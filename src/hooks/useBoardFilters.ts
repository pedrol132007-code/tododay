import { useSyncExternalStore } from "react";
import { filtersToSearch, parseFilters, type BoardFilters } from "../lib/boardFilters";
import {
  boardLinkToSearch,
  clearBoardLink,
  dashboardViewToSearch,
  parseBoardLink,
  parseDashboardView,
  type BoardLink,
  type BoardLinkTarget,
  type DashboardViewState,
} from "../lib/dashboardLinks";

// Os filtros do board moram na query string: um link com ?responsavel=ana abre o board filtrado.
// Também o período e a pessoa do dashboard, e o link do dashboard para o board (de onde veio e o
// card a abrir), para o "Voltar ao dashboard" reabrir como estava.
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

const useSearch = () => useSyncExternalStore(subscribe, () => window.location.search);

function replaceSearch(search: string) {
  const { pathname, hash } = window.location;
  window.history.replaceState(null, "", pathname + search + hash);
  window.dispatchEvent(new Event(CHANGE));
}

export function setBoardFilters(filters: BoardFilters) {
  replaceSearch(filtersToSearch(filters, window.location.search));
}

export function useBoardFilters(): [BoardFilters, (filters: BoardFilters) => void] {
  return [parseFilters(useSearch()), setBoardFilters];
}

export function useDashboardView(): [DashboardViewState, (state: DashboardViewState) => void] {
  return [parseDashboardView(useSearch()), (state) => replaceSearch(dashboardViewToSearch(state, window.location.search))];
}

export const useBoardLink = (): BoardLink => parseBoardLink(useSearch());

/** Abre o board a partir do dashboard: filtros, de onde veio e (opcional) um card. */
export function openBoardLink(link: BoardLinkTarget) {
  replaceSearch(boardLinkToSearch(link, window.location.search));
}

function editSearch(edit: (params: URLSearchParams) => void) {
  const p = new URLSearchParams(window.location.search);
  edit(p);
  const s = p.toString();
  replaceSearch(s ? `?${s}` : "");
}

/** Card aberto no board (ou nenhum), sem mexer no resto da URL. */
export const setOpenCard = (card: string | null) => editSearch((p) => (card ? p.set("card", card) : p.delete("card")));

/** Volta ao dashboard: some com os filtros do link, a origem e o card. */
export function leaveBoardLink() {
  replaceSearch(clearBoardLink(window.location.search));
}

/** Trocar de aba à mão: o link do dashboard deixa de valer (os filtros ficam, como sempre). */
export const dropBoardLinkOrigin = () =>
  editSearch((p) => {
    p.delete("origem");
    p.delete("card");
  });
