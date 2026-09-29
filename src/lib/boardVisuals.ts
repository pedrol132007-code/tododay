// Regras visuais do board: selo de vencimento e cor de cada pessoa.

import type { CardPriority, ListStatus } from "../types";

export const LIST_STATUS_LABEL: Record<ListStatus, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  done: "Concluído",
};

/** Da mais para a menos urgente (ordem dos menus e da ordenação). */
export const PRIORITIES: CardPriority[] = ["urgent", "high", "medium", "low"];

export const PRIORITY_LABEL: Record<CardPriority, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// due_date vem como "AAAA-MM-DD", sem fuso: compara como data local, não como instante.
function parseDate(due: string): { y: number; m: number; d: number } {
  const [y, m, d] = due.split("-").map(Number);
  return { y, m, d };
}

export function formatDue(due: string, today: Date): string {
  const { y, m, d } = parseDate(due);
  const base = `${d} ${MONTHS[m - 1]}`;
  return y === today.getFullYear() ? base : `${base} ${y}`;
}

// Tons médios que aguentam texto branco e se destacam tanto no creme quanto no grafite.
export const MEMBER_COLORS = [
  "#2538ff", // azul Benner
  "#e51e47", // vermelho Benner
  "#7b3fe4",
  "#0e8a6a",
  "#c2410c",
  "#0369a1",
  "#be185d",
  "#4d7c0f",
];

export function memberColor(userId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return MEMBER_COLORS[(hash >>> 0) % MEMBER_COLORS.length];
}

/** Tamanho de arquivo em português: "820 KB", "1,4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
