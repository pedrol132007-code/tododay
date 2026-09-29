// Espelha supabase/migrations/.
export interface Board {
  id: number;
  team_id: number;
  name: string;
  position: number;
  created_at: string;
}

/** Tipo por trás da coluna (o nome é livre): é o que as métricas usam. */
export type ListStatus = "todo" | "doing" | "done";

export interface List {
  id: number;
  board_id: number;
  name: string;
  position: number;
  wip_limit: number | null;
  status: ListStatus;
}

export type CardPriority = "low" | "medium" | "high" | "urgent";

export interface Card {
  id: number;
  list_id: number;
  board_id: number;
  title: string;
  description: string;
  position: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** Membro da equipe (profile.id); o banco recusa quem não é. */
  assignee_id: string | null;
  /** null = sem prioridade. */
  priority: CardPriority | null;
  /** Quando entrou na coluna atual; o banco preenche (só muda ao trocar de coluna). */
  list_entered_at: string;
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

export type MemberRole = "admin" | "member" | "viewer";

export interface Team {
  id: number;
  name: string;
  created_by: string | null;
  created_at: string;
}

/** Equipe do ponto de vista do usuário logado. */
export interface MyTeam extends Team {
  role: MemberRole;
}

export interface TeamMember {
  team_id: number;
  user_id: string;
  role: MemberRole;
  job_title: string;
  joined_at: string;
}

export interface TeamInvite {
  id: number;
  team_id: number;
  token: string;
  label: string;
  role: MemberRole;
  job_title: string;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
  revoked_at: string | null;
}

// id é o uuid de auth.users.
export interface Profile {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

/** Preenchida por triggers (supabase/migrations/0009_activity.sql); payload guarda os nomes da época. */
export interface Activity {
  id: number;
  team_id: number;
  board_id: number | null;
  card_id: number | null;
  actor_id: string | null;
  actor_name: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Dashboard (docs/superpowers/specs/2026-09-25-dashboard-design.md). Hoje só a demonstração gera. */
export interface DashboardPerson {
  id: string;
  name: string;
}

/** Status de uma tarefa do dashboard (docs/superpowers/specs/2026-09-28-dashboard-gestor-design.md). */
export type DashboardStatus = "planned" | "in_progress" | "done";

export interface DashboardStatusChange {
  /** "AAAA-MM-DD". */
  day: string;
  to: DashboardStatus;
}

export interface DashboardTask {
  id: string;
  title: string;
  assigneeId: string;
  /** "AAAA-MM-DD"; igual ao primeiro item do histórico. */
  createdDay: string;
  dueDay: string | null;
  /** null = sem prioridade. */
  priority: CardPriority | null;
  /** Nomes das etiquetas. */
  labels: string[];
  /** Em ordem; começa em planned e done é final. */
  history: DashboardStatusChange[];
}

export interface DashboardData {
  people: DashboardPerson[];
  tasks: DashboardTask[];
  /** Dia a que os dados se referem ("hoje"), "AAAA-MM-DD". */
  today: string;
  /** Primeiro dia com dados completos (antes dele os números não são confiáveis). */
  since: string;
  isDemo: boolean;
}
