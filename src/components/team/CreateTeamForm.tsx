import { useState, type FormEvent } from "react";
import { useCreateTeam } from "../../hooks/useTeams";

interface CreateTeamFormProps {
  userId: string;
  onCreated: (teamId: number) => void;
  onCancel?: () => void;
}

export function CreateTeamForm({ userId, onCreated, onCancel }: CreateTeamFormProps) {
  const createTeam = useCreateTeam(userId);
  const [name, setName] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createTeam.mutate(trimmed, { onSuccess: onCreated });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel?.();
        }}
        placeholder="Nome da equipe..."
        className="w-full rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-purple"
      />
      {createTeam.isError && (
        <p className="text-sm text-accent-pink">Não foi possível criar a equipe. Tente de novo.</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={createTeam.isPending || !name.trim()}
          className="rounded-xl bg-accent-purple px-3 py-2 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {createTeam.isPending ? "Criando..." : "Criar equipe"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-3 py-2 text-sm text-text-muted hover:bg-bg-elevated"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
