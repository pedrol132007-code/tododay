import { useState, type FormEvent } from "react";
import {
  useInviteMember,
  useOpenInvites,
  usePasswordLink,
  usePendingMembers,
  useRemoveTeamMember,
  useRenameTeam,
  useRevokeInvite,
  useTeamMembers,
  useUpdateTeamMember,
} from "../../hooks/useTeams";
import { InlineEditableText } from "../ui/InlineEditableText";
import { ActivityList } from "../ui/ActivityList";
import { Avatar } from "../ui/Avatar";
import { IconCrown } from "../ui/icons";
import { useTeamActivity } from "../../hooks/useActivity";
import { inviteUrl } from "../../lib/pendingInvite";
import type { MemberRole, MyTeam, TeamInvite } from "../../types";

import { PageHeader } from "../ui/PageHeader";

const roleOptions: { value: MemberRole; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "gerencia a equipe, boards e colunas" },
  { value: "member", label: "Membro", hint: "trabalha nos cards" },
  { value: "viewer", label: "Leitor", hint: "só visualiza" },
];

const roleLabel = (role: MemberRole) => roleOptions.find((o) => o.value === role)!.label;

// Erros do Postgres (ex.: "A equipe precisa de pelo menos um admin") já vêm em português.
function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "Algo deu errado. Tente de novo.";
}

interface TeamViewProps {
  userId: string;
  team: MyTeam;
  onBack: () => void;
}

export function TeamView({ userId, team, onBack }: TeamViewProps) {
  const isAdmin = team.role === "admin";
  const { data: members } = useTeamMembers(team.id);
  const { data: invites } = useOpenInvites(team.id, isAdmin);
  const { data: pending } = usePendingMembers(team.id, isAdmin);
  const renameTeam = useRenameTeam(team.id);
  const updateMember = useUpdateTeamMember(team.id);
  const removeMember = useRemoveTeamMember(team.id);
  const revokeInvite = useRevokeInvite(team.id);
  const { data: activities } = useTeamActivity(team.id);
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null);
  const [confirmingDeactivation, setConfirmingDeactivation] = useState<string | null>(null);

  // Um líder por equipe (0020): dar a coroa a outra pessoa tira a do líder atual.
  const leader = members?.find((m) => m.is_leader);

  const actionError = updateMember.error ?? removeMember.error ?? revokeInvite.error ?? renameTeam.error;

  function handleRemove(memberId: string) {
    if (confirmingRemoval !== memberId) {
      setConfirmingRemoval(memberId);
      return;
    }
    setConfirmingRemoval(null);
    removeMember.mutate(memberId);
  }

  // Desativar tira o acesso sem apagar nada: os cards continuam com a pessoa e o histórico fica.
  function handleToggleActive(memberId: string, active: boolean) {
    if (active) {
      updateMember.mutate({ userId: memberId, changes: { deactivated_at: null } });
      return;
    }
    if (confirmingDeactivation !== memberId) {
      setConfirmingDeactivation(memberId);
      return;
    }
    setConfirmingDeactivation(null);
    updateMember.mutate({ userId: memberId, changes: { deactivated_at: new Date().toISOString() } });
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <PageHeader
        eyebrow="Equipe"
        title={
          <InlineEditableText
          value={team.name}
          onSave={(name) => renameTeam.mutate(name)}
          
          readOnly={!isAdmin}
        />
        }
        onBack={onBack}
      />

      <div className="flex max-w-3xl flex-col gap-8">
        {actionError && (
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{errorMessage(actionError)}</p>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-muted">Membros</h2>
          {(members ?? []).map((member) => {
            const isSelf = member.user_id === userId;
            const deactivated = Boolean(member.deactivated_at);
            return (
              <div
                key={member.user_id}
                className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 ${
                  deactivated ? "border-dashed border-border" : "border-border bg-bg-elevated"
                }`}
              >
                <Avatar userId={member.user_id} name={member.profile.display_name} avatarUrl={member.profile.avatar_url} leader={member.is_leader} large />
                <div className="flex min-w-[12rem] flex-1 flex-col">
                  <span className={deactivated ? "text-text-muted" : "text-text-primary"}>
                    {member.profile.display_name}
                    {isSelf && <span className="text-text-muted"> (você)</span>}
                    {member.is_leader && <span className="text-highlight"> · Líder</span>}
                    {deactivated && <span className="text-text-muted"> · desativado</span>}
                    {pending?.includes(member.user_id) && <span className="text-text-muted"> · convite pendente</span>}
                  </span>
                  <span className="text-xs text-text-muted">{member.profile.email}</span>
                </div>
                {isAdmin && !deactivated && pending?.includes(member.user_id) && (
                  <PasswordLinkButton teamId={team.id} userId={member.user_id} />
                )}
                {isAdmin ? (
                  <input
                    key={member.job_title}
                    defaultValue={member.job_title}
                    placeholder="Cargo"
                    onBlur={(e) => {
                      const jobTitle = e.target.value.trim();
                      if (jobTitle !== member.job_title) {
                        updateMember.mutate({ userId: member.user_id, changes: { job_title: jobTitle } });
                      }
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    className="w-40 rounded-lg border border-border bg-bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
                  />
                ) : (
                  member.job_title && <span className="text-sm text-text-muted">{member.job_title}</span>
                )}
                {isAdmin ? (
                  <select
                    value={member.role}
                    onChange={(e) => {
                      const role = e.target.value as MemberRole;
                      updateMember.mutate({
                        userId: member.user_id,
                        changes: role === "viewer" && member.is_leader ? { role, is_leader: false } : { role },
                      });
                    }}
                    className="rounded-lg border border-border bg-bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
                  >
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-text-muted">{roleLabel(member.role)}</span>
                )}
                {isAdmin && !deactivated && member.role !== "viewer" && (
                  <button
                    type="button"
                    onClick={() => updateMember.mutate({ userId: member.user_id, changes: { is_leader: !member.is_leader } })}
                    title={
                      member.is_leader
                        ? "Tira a coroa de líder"
                        : leader
                          ? `A coroa passa de ${leader.profile.display_name} para ${member.profile.display_name}`
                          : "Líder vê todos os boards, cria boards e escolhe as pessoas de cada um"
                    }
                    className="flex items-center gap-1 rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-surface hover:text-text-primary"
                  >
                    <IconCrown size={14} className={member.is_leader ? "text-highlight" : ""} />
                    {member.is_leader ? "Tirar coroa" : leader ? "Passar a coroa" : "Tornar líder"}
                  </button>
                )}
                {isAdmin && !isSelf && (
                  <button
                    type="button"
                    onBlur={() => setConfirmingDeactivation(null)}
                    onClick={() => handleToggleActive(member.user_id, deactivated)}
                    title={deactivated ? "Devolve o acesso à equipe" : "Tira o acesso, mas os cards e o histórico continuam"}
                    className={`rounded-lg px-3 py-1 text-sm ${
                      confirmingDeactivation === member.user_id
                        ? "bg-danger text-on-accent"
                        : "text-text-muted hover:bg-bg-surface hover:text-text-primary"
                    }`}
                  >
                    {deactivated ? "Reativar" : confirmingDeactivation === member.user_id ? "Confirmar?" : "Desativar"}
                  </button>
                )}
                {(isAdmin || isSelf) && (
                  <button
                    type="button"
                    title={isSelf ? undefined : "Remove da equipe e tira a pessoa de responsável dos cards"}
                    onBlur={() => setConfirmingRemoval(null)}
                    onClick={() => handleRemove(member.user_id)}
                    className={`rounded-lg px-3 py-1 text-sm hover:bg-danger hover:text-on-accent ${
                      confirmingRemoval === member.user_id ? "bg-danger text-on-accent" : "text-text-muted"
                    }`}
                  >
                    {confirmingRemoval === member.user_id ? "Confirmar?" : isSelf ? "Sair da equipe" : "Remover"}
                  </button>
                )}
              </div>
            );
          })}
        </section>

        {isAdmin && (
          <>
            <InviteForm teamId={team.id} />

            {(invites ?? []).length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-text-muted">Links de convite abertos</h2>
                {(invites ?? []).map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2"
                  >
                    <span className="min-w-[12rem] flex-1 text-text-primary">{invite.label || "Sem nome"}</span>
                    {invite.job_title && <span className="text-sm text-text-muted">{invite.job_title}</span>}
                    <span className="text-sm text-text-muted">{roleLabel(invite.role)}</span>
                    <span className="text-xs text-text-muted">
                      expira {new Date(invite.expires_at).toLocaleDateString("pt-BR")}
                    </span>
                    <CopyLinkButton invite={invite} />
                    <button
                      type="button"
                      onClick={() => revokeInvite.mutate(invite.id)}
                      className="rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-danger hover:text-on-accent"
                    >
                      Cancelar
                    </button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-muted">Atividade recente</h2>
          <ActivityList activities={activities} where="team" />
        </section>
      </div>
    </div>
  );
}

function CopyLinkButton({ invite }: { invite: TeamInvite }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl(invite.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-lg px-3 py-1 text-sm text-primary hover:bg-bg-elevated"
    >
      {copied ? "Copiado!" : "Copiar link"}
    </button>
  );
}

/** Para quem não achou o e-mail do convite: um link para definir a senha, para mandar por outro canal. */
function PasswordLinkButton({ teamId, userId }: { teamId: number; userId: string }) {
  const passwordLink = usePasswordLink(teamId);
  const [copied, setCopied] = useState(false);

  async function handleCopy(link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (passwordLink.data) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-primary bg-bg-surface px-3 py-2">
        <code className="min-w-0 flex-1 truncate text-xs text-text-primary">{passwordLink.data}</code>
        <button type="button" onClick={() => handleCopy(passwordLink.data)} className="rounded-lg px-3 py-1 text-sm text-primary hover:bg-bg-elevated">
          {copied ? "Copiado!" : "Copiar link"}
        </button>
        <span className="w-full text-xs text-text-muted">Mande por Teams ou WhatsApp. Vale por pouco tempo e só uma vez.</span>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={passwordLink.isPending}
        onClick={() => passwordLink.mutate(userId)}
        title="Para quando o e-mail do convite não chegou"
        className="rounded-lg px-3 py-1 text-sm text-primary hover:bg-bg-surface disabled:opacity-50"
      >
        {passwordLink.isPending ? "Gerando..." : "Gerar link de acesso"}
      </button>
      {passwordLink.isError && <p className="w-full text-sm text-danger">{errorMessage(passwordLink.error)}</p>}
    </>
  );
}

function InviteForm({ teamId }: { teamId: number }) {
  const inviteMember = useInviteMember(teamId);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [jobTitle, setJobTitle] = useState("");
  const [done, setDone] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    const invited = email.trim();
    inviteMember.mutate(
      { email: invited, name: name.trim(), role, jobTitle: jobTitle.trim() },
      {
        onSuccess: (status) => {
          setDone(
            status === "invited"
              ? `Convite enviado para ${invited}. Se não chegar (veja o lixo eletrônico), use "Gerar link de acesso" ao lado do nome. Inclua a pessoa nos boards em “Pessoas do board”, no menu de cada board.`
              : `${invited} já tinha conta no Tododay e entrou na equipe. Inclua a pessoa nos boards em “Pessoas do board”, no menu de cada board.`,
          );
          setEmail("");
          setName("");
          setJobTitle("");
        },
      },
    );
  }

  const field = "rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-primary";
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-text-muted">Convidar</h2>
      <p className="text-sm text-text-muted">A pessoa recebe um e-mail com um link para definir a própria senha e entrar na equipe.</p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          aria-label="E-mail"
          className={`min-w-[14rem] flex-1 ${field}`}
        />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" aria-label="Nome" className={`w-40 ${field}`} />
        <input
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="Cargo (opcional)"
          aria-label="Cargo"
          className={`w-40 ${field}`}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)} aria-label="Papel" className={field}>
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} — {option.hint}
            </option>
          ))}
        </select>
        <button type="submit" disabled={inviteMember.isPending} className="btn-primary px-3 py-1.5 disabled:opacity-50">
          {inviteMember.isPending ? "Enviando..." : "Convidar"}
        </button>
      </form>
      {inviteMember.isError && <p className="text-sm text-danger">{errorMessage(inviteMember.error)}</p>}
      {done && <p className="text-sm text-text-primary">{done}</p>}
    </section>
  );
}
