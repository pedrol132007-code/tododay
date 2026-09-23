import type { Activity, MemberRole } from "../types";

const roleNames: Record<MemberRole, string> = { admin: "admin", member: "membro", viewer: "leitor" };

function role(value: unknown): string {
  return roleNames[value as MemberRole] ?? String(value);
}

function isoDateToBr(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Frase em português para uma entrada do histórico, sem o nome de quem fez (a tela mostra
 * actor_name antes). No histórico do próprio card ("card") o título do card fica implícito;
 * no da equipe ("team") ele aparece entre aspas.
 */
export function describeActivity(activity: Activity, where: "card" | "team"): string {
  const p = activity.payload as Record<string, string | null>;
  const card = where === "team" && p.title ? ` “${p.title}”` : "";
  const onCard = where === "team" && p.title ? ` em “${p.title}”` : "";

  switch (activity.action) {
    case "card.created":
      return where === "team" ? `criou o card${card} em ${p.list}` : `criou o card em ${p.list}`;
    case "card.renamed":
      return where === "team" ? `renomeou “${p.from}” para “${p.title}”` : `renomeou de “${p.from}” para “${p.title}”`;
    case "card.moved":
      return `moveu${card} de ${p.from} para ${p.to}`;
    case "card.description_changed":
      return `editou a descrição${where === "team" && p.title ? ` de “${p.title}”` : ""}`;
    case "card.due_date_changed":
      return p.to ? `mudou o vencimento${onCard} para ${isoDateToBr(p.to)}` : `tirou o vencimento${onCard}`;
    case "card.assigned":
      return `definiu ${p.name} como responsável${onCard}`;
    case "card.unassigned":
      return `tirou ${p.name ?? "o responsável"} de responsável${onCard}`;
    case "card.archived":
      return `arquivou${card || " o card"}`;
    case "card.restored":
      return `restaurou${card || " o card"}`;
    case "card.deleted":
      return `apagou o card “${p.title}”`;
    case "checklist.added":
      return `adicionou “${p.item}” ao checklist${onCard}`;
    case "checklist.removed":
      return `removeu “${p.item}” do checklist${onCard}`;
    case "checklist.checked":
      return `marcou “${p.item}” no checklist${onCard}`;
    case "checklist.unchecked":
      return `desmarcou “${p.item}” no checklist${onCard}`;
    case "label.added":
      return `adicionou a label ${p.label}${onCard}`;
    case "label.removed":
      return `removeu a label ${p.label}${onCard}`;
    case "list.created":
      return `criou a coluna ${p.name} em ${p.board}`;
    case "list.renamed":
      return `renomeou a coluna ${p.from} para ${p.name}`;
    case "list.deleted":
      return `apagou a coluna ${p.name} de ${p.board}`;
    case "board.created":
      return `criou o board ${p.name}`;
    case "board.renamed":
      return `renomeou o board ${p.from} para ${p.name}`;
    case "board.deleted":
      return `apagou o board ${p.name}`;
    case "member.joined":
      return activity.actor_name === p.name ? `entrou na equipe como ${role(p.role)}` : `adicionou ${p.name} como ${role(p.role)}`;
    case "member.left":
      return "saiu da equipe";
    case "member.removed":
      return `removeu ${p.name} da equipe`;
    case "member.role_changed":
      return `mudou ${p.name} de ${role(p.from)} para ${role(p.to)}`;
    case "member.job_title_changed":
      return p.to ? `definiu o cargo de ${p.name} como ${p.to}` : `tirou o cargo de ${p.name}`;
    case "team.renamed":
      return `renomeou a equipe de ${p.from} para ${p.name}`;
    case "invite.created":
      return `gerou um convite para ${p.label || "alguém"} (${role(p.role)})`;
    case "invite.revoked":
      return `cancelou o convite para ${p.label || "alguém"}`;
    default:
      return activity.action;
  }
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "há 1 dia" : `há ${days} dias`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
