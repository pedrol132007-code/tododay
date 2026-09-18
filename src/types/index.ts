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
  id: number;
  title: string;
  list_id: number;
  board_id: number;
  board_name: string;
}
