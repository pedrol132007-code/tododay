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

/** Metadados de um anexo; o arquivo fica no bucket privado "attachments" (0011_attachments.sql). */
export interface CardAttachment {
  id: number;
  card_id: number;
  board_id: number;
  /** Nome original (só metadado; no Storage o arquivo é "<card_id>/<uuid>"). */
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  uploaded_by: string | null;
  /** Nome de quem enviou, na época. */
  uploaded_by_name: string;
  created_at: string;
  /** Imagem usada como capa do card no board. */
  is_cover: boolean;
}

/** "A partir de changed_at o card estava neste status"; só o banco grava (0012_card_status_history.sql). */
export interface CardStatusHistory {
  id: number;
  card_id: number;
  board_id: number;
  status: ListStatus;
  changed_at: string;
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
  /** Líder da equipe (0016; um só desde 0020): vê todos os boards, cria e organiza boards. */
  is_leader: boolean;
}

export interface TeamMember {
  team_id: number;
  user_id: string;
  role: MemberRole;
  job_title: string;
  joined_at: string;
  /** Desativado: sem acesso à equipe, mas continua nos cards e no histórico (0013). */
  deactivated_at: string | null;
  /** Coroa de líder (0016; um por equipe desde 0020): vê todos os boards, cria e renomeia boards,
   * escolhe as pessoas de cada board e mexe no tipo e limite das colunas. Leitor não é líder. */
  is_leader: boolean;
}

/** Quem participa de um board (0020). Admin e líder veem todos os boards sem estar aqui. */
export interface BoardMember {
  board_id: number;
  user_id: string;
  added_at: string;
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
  /** Caminho da foto no bucket público "avatars" ("<id>/<uuid>.webp"); null = iniciais. */
  avatar_path: string | null;
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

/** O que gerou a notificação (0017_notifications.sql). */
export type NotificationKind = "assigned" | "due_3d" | "due_1d" | "overdue" | "changed";
export type NotificationChange = "due_date" | "description" | "list" | "attachments";

/** Guardado na época: a lista mostra isto mesmo se o card ou a pessoa mudarem depois. */
export interface NotificationPayload {
  card_title: string;
  board_name: string;
  actor_name: string | null;
  actor_was_leader: boolean;
  due_date: string | null;
  /** Avisos de prazo: dias que faltavam (negativo = atrasado). */
  days_left?: number;
  /** changed: o que mudou, sem repetição. */
  changes?: NotificationChange[];
  /** changed: quantos anexos novos. */
  attachments?: number;
  /** changed: coluna atual do card. */
  list_name?: string;
}

/** "Notification" sozinho colide com a API de notificações do navegador. */
export interface AppNotification {
  id: number;
  user_id: string;
  team_id: number;
  board_id: number | null;
  card_id: number | null;
  actor_id: string | null;
  kind: NotificationKind;
  due_key: string | null;
  payload: NotificationPayload;
  created_at: string;
  updated_at: string;
  read_at: string | null;
}

/** Dashboard (docs/superpowers/specs/2026-09-25-dashboard-design.md). Hoje só a demonstração gera. */
export interface DashboardPerson {
  id: string;
  name: string;
  /** Só a demonstração preenche (imagem gerada no navegador). */
  avatarUrl?: string | null;
  isLeader?: boolean;
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
