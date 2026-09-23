import { UserMenu } from "../auth/UserMenu";
import { CreateTeamForm } from "./CreateTeamForm";

export function NoTeamScreen({ userId, onCreated }: { userId: string; onCreated: (teamId: number) => void }) {
  return (
    <div className="flex h-screen w-screen flex-col bg-bg-base">
      <div className="flex justify-end border-b border-border bg-bg-surface py-2">
        <UserMenu userId={userId} />
      </div>
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-surface p-8">
          <h1 className="mb-2 text-xl font-semibold text-text-primary">Você ainda não está em nenhuma equipe</h1>
          <p className="mb-6 text-sm leading-relaxed text-text-muted">
            Peça para o admin da sua equipe te convidar pelo seu e-mail, ou crie uma equipe nova.
          </p>
          <CreateTeamForm userId={userId} onCreated={onCreated} />
        </div>
      </div>
    </div>
  );
}
