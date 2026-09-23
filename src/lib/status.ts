import type { CardStatus } from "../types";

export const CARD_STATUSES: CardStatus[] = ["planned", "in_progress", "done"];

export const STATUS_LABELS: Record<CardStatus, string> = {
  planned: "Planejada",
  in_progress: "Em processo",
  done: "Finalizada",
};

// Theme-dependent (src/index.css): the dark-theme amber is unreadable on a light background.
export const STATUS_COLORS: Record<CardStatus, string> = {
  planned: "var(--status-planned)",
  in_progress: "var(--status-in-progress)",
  done: "var(--status-done)",
};
