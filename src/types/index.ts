export interface Board {
  id: number;
  name: string;
  position: number;
  created_at: string;
}

export interface List {
  id: number;
  board_id: number;
  name: string;
  position: number;
  wip_limit: number | null;
}

export type CardStatus = "planned" | "in_progress" | "done";

export interface Card {
  id: number;
  list_id: number;
  title: string;
  description: string;
  position: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  status: CardStatus;
  requested_by: number | null;
}

export interface Label {
  id: number;
  board_id: number;
  name: string;
  color: string;
}

export interface CardLabel {
  card_id: number;
  label_id: number;
}

export interface ChecklistItem {
  id: number;
  card_id: number;
  text: string;
  done: boolean;
  position: number;
}

export interface SearchResult {
  type: "card" | "list";
  id: number;
  title: string;
  board_id: number;
  board_name: string;
}

export interface Member {
  id: number;
  name: string;
  role: string;
  contact: string;
  notes: string;
  color: string;
  position: number;
  created_at: string;
}

export type StatusCounts = Record<CardStatus, number>;

export interface BoardStatusSummary extends StatusCounts {
  board_id: number;
  board_name: string;
}

export interface MemberRequestStats extends StatusCounts {
  member_id: number;
}
