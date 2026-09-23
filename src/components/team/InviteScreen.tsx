import { AuthLayout, Notice } from "../auth/AuthLayout";
import { useAcceptInvite, useInvitePreview } from "../../hooks/useTeams";
import type { InvitePreview } from "../../db/teams";

const roleLabels: Record<InvitePreview["role"], string> = {
  admin: "admin",
  member: "membro",
  viewer: "leitor (só visualiza)",
};

const closedMessages: Record<"used" | "expired" | "revoked", string> = {
  used: "Esse convite já foi usado.",
  expired: "Esse convite expirou.",
  revoked: "Esse convite foi cancelado.",
};

interface InviteScreenProps {
  token: string;
  /** teamId: entrou (ou já estava) na equipe; null: não aceitou ou o convite não vale. */
  onDone: (teamId: number | null) => void;
}

export function InviteScreen({ token, onDone }: InviteScreenProps) {
  const { data: preview, isPending, isError } = useInvitePreview(token);
  const accept = useAcceptInvite();

  function handleAccept() {
    accept.mutate(token, { onSuccess: (teamId) => onDone(teamId) });
  }

  if (isPending) {
    return <div className="h-screen w-screen bg-bg-base" />;
  }

  if (isError || !preview || preview.status in closedMessages) {
    const message = preview && preview.status in closedMessages
      ? closedMessages[preview.status as keyof typeof closedMessages]
      : "Não encontramos esse convite.";
    return (
      <AuthLayout title="Convite indisponível">
        <Notice>{message} Peça um link novo para o admin da equipe.</Notice>
        <ContinueButton onClick={() => onDone(null)}>Continuar</ContinueButton>
      </AuthLayout>
    );
  }

  if (preview.status === "already_member") {
    return (
      <AuthLayout title="Você já está nessa equipe">
        <Notice>
          Você já faz parte de <strong>{preview.team_name}</strong>.
        </Notice>
        <ContinueButton onClick={handleAccept} busy={accept.isPending}>
          Abrir a equipe
        </ContinueButton>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Você foi convidado">
      <Notice>
        Você foi convidado para a equipe <strong>{preview.team_name}</strong> como {roleLabels[preview.role]}.
      </Notice>
      {accept.isError && (
        <p className="mt-4 text-sm text-accent-pink">
          {/* Erros de accept_invite() já vêm em português ("Esse convite expirou...") */}
          {(accept.error as { message?: string }).message ?? "Não foi possível aceitar o convite."}
        </p>
      )}
      <ContinueButton onClick={handleAccept} busy={accept.isPending}>
        Entrar na equipe
      </ContinueButton>
      <button
        type="button"
        onClick={() => onDone(null)}
        className="mt-3 w-full text-sm text-text-muted hover:text-accent-purple"
      >
        Agora não
      </button>
    </AuthLayout>
  );
}

function ContinueButton({ onClick, busy, children }: { onClick: () => void; busy?: boolean; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="mt-6 w-full rounded-xl bg-accent-purple px-3 py-2 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {busy ? "Aguarde..." : children}
    </button>
  );
}
