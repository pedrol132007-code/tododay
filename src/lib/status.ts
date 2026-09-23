import type { CardStatus } from "../types";

export const CARD_STATUSES: CardStatus[] = ["planned", "in_progress", "done"];

export const STATUS_LABELS: Record<CardStatus, string> = {
  planned: "Planejada",
  in_progress: "Em processo",
  done: "Finalizada",
};

export const STATUS_COLORS: Record<CardStatus, string> = {
  planned: "#a99fc2",
  in_progress: "#f5d68a",
  done: "#86efac",
};
