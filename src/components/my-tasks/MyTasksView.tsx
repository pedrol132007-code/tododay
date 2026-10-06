import { useMyTasks } from "../../hooks/useMyTasks";
import type { MyTask } from "../../db/myTasks";
import { PRIORITY_LABEL } from "../../lib/boardVisuals";
import { localDay } from "../../lib/dashboardRules";
import { groupMyTasks } from "../../lib/myTasks";
import { DueBadge } from "../ui/DueBadge";
import { EmptyState } from "../ui/EmptyState";
import { IconTasks } from "../ui/icons";
import { PageHeader } from "../ui/PageHeader";

interface MyTasksViewProps {
  teamId: number;
  userId: string;
  onBack: () => void;
  onOpenCard: (task: MyTask) => void;
}

/** Tudo o que está com a pessoa nos boards da equipe, por prazo (lib/myTasks.ts). */
export function MyTasksView({ teamId, userId, onBack, onOpenCard }: MyTasksViewProps) {
  const { data, isError } = useMyTasks(teamId, userId);
  const groups = data ? groupMyTasks(data, localDay(new Date())) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <PageHeader title="Minhas tarefas" onBack={onBack} />
      <div className="flex max-w-2xl flex-col gap-6">
        {isError ? (
          <EmptyState icon={<IconTasks size={22} />} title="Não foi possível carregar suas tarefas." description="Verifique sua internet e tente de novo." />
        ) : data && groups.length === 0 ? (
          <EmptyState icon={<IconTasks size={22} />} title="Nada atribuído a você agora." description="Quando alguém puser você como responsável de um card, ele aparece aqui." />
        ) : (
          groups.map((group) => (
            <section key={group.id} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                {group.label} <span className="font-normal">({group.tasks.length})</span>
              </h2>
              {group.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenCard(task)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-bg-card px-3 py-2 text-left hover:border-highlight"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-text-primary">{task.title}</span>
                    <span className="truncate text-xs text-text-muted">
                      {task.board.name} › {task.list.name}
                    </span>
                  </span>
                  {task.priority && <span className="shrink-0 text-xs text-text-muted">{PRIORITY_LABEL[task.priority]}</span>}
                  {task.due_date && <DueBadge due={task.due_date} withLabel />}
                </button>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
