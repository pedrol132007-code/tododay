import { useState, type FormEvent } from "react";
import {
  useCreateInvite,
  useOpenInvites,
  useRemoveTeamMember,
  useRenameTeam,
  useRevokeInvite,
  useTeamMembers,
  useUpdateTeamMember,
} from "../../hooks/useTeams";
import { InlineEditableText } from "../ui/InlineEditableText";
import { ActivityList } from "../ui/ActivityList";
import { useTeamActivity } from "../../hooks/useActivity";
import { inviteUrl } from "../../lib/pendingInvite";
import type { MemberRole, MyTeam, TeamInvite } from "../../types";
import { PageHeader } from "../ui/PageHeader";

const roleOptions: { value: MemberRole; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "edita tudo e gerencia a equipe" },
  { value: "member", label: "Membro", hint: "edita boards e cards" },
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
  const renameTeam = useRenameTeam(team.id);
  const updateMember = useUpdateTeamMember(team.id);
  const removeMember = useRemoveTeamMember(team.id);
  const revokeInvite = useRevokeInvite(team.id);
  const { data: activities } = useTeamActivity(team.id);
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null);

  const actionError = updateMember.error ?? removeMember.error ?? revokeInvite.error ?? renameTeam.error;

  function handleRemove(memberId: string) {
    if (confirmingRemoval !== memberId) {
      setConfirmingRemoval(memberId);
      return;
    }
    setConfirmingRemoval(null);
    removeMember.mutate(memberId);
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
            return (
              <div
                key={member.user_id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg-elevated px-3 py-2"
              >
                <div className="flex min-w-[12rem] flex-1 flex-col">
                  <span className="text-text-primary">
                    {member.profile.display_name}
                    {isSelf && <span className="text-text-muted"> (você)</span>}
                  </span>
                  <span className="text-xs text-text-muted">{member.profile.email}</span>
                </div>
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
                    onChange={(e) =>
                      updateMember.mutate({ userId: member.user_id, changes: { role: e.target.value as MemberRole } })
                    }
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
                {(isAdmin || isSelf) && (
                  <button
                    type="button"
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

function InviteForm({ teamId }: { teamId: number }) {
  const createInvite = useCreateInvite(teamId);
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [jobTitle, setJobTitle] = useState("");
  const [created, setCreated] = useState<TeamInvite | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setCreated(null);
    createInvite.mutate(
      { label: label.trim(), role, job_title: jobTitle.trim() },
      {
        onSuccess: (invite) => {
          setCreated(invite);
          setLabel("");
          setJobTitle("");
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-text-muted">Convidar</h2>
      <p className="text-sm text-text-muted">
        Gere um link e mande para a pessoa (WhatsApp, e-mail...). Ele vale para uma pessoa só, por 7 dias.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Para quem? (ex.: Carla)"
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
        />
        <input
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="Cargo (opcional)"
          className="w-40 rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          className="rounded-lg border border-border bg-bg-elevated px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
        >
          {roleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} — {option.hint}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={createInvite.isPending}
          className="btn-primary px-3 py-1.5 disabled:opacity-50"
        >
          {createInvite.isPending ? "Gerando..." : "Gerar link"}
        </button>
      </form>
      {createInvite.isError && <p className="text-sm text-danger">Não foi possível gerar o link. Tente de novo.</p>}
      {created && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary bg-bg-elevated px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-sm text-text-primary">{inviteUrl(created.token)}</code>
          <CopyLinkButton invite={created} />
        </div>
      )}
    </section>
  );
}
