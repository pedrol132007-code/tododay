import { UserMenu } from "../auth/UserMenu";
import { BrandMark } from "../ui/BrandMark";
import { CreateTeamForm } from "./CreateTeamForm";

export function NoTeamScreen({ userId, onCreated }: { userId: string; onCreated: (teamId: number) => void }) {
  return (
    <div className="flex h-screen w-screen flex-col bg-brand-hero">
      <div className="flex items-center justify-between border-b border-border bg-bg-surface py-2 pl-4">
        <BrandMark />
        <UserMenu userId={userId} />
      </div>
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl bg-bg-surface p-8 shadow-card">
          <div className="mb-4 h-0.5 w-12 bg-danger" />
          <h1 className="mb-2 text-2xl font-normal tracking-tight text-text-primary">Você ainda não está em nenhuma equipe</h1>
          <p className="mb-6 text-sm leading-relaxed text-text-muted">
            Peça um link de convite para o admin da sua equipe, ou crie uma equipe nova.
          </p>
          <CreateTeamForm userId={userId} onCreated={onCreated} />
        </div>
      </div>
    </div>
  );
}
