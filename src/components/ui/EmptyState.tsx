import type { ReactNode } from "react";

/** Mensagem de "nada aqui ainda": ícone em destaque, título, explicação e ação opcional. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</span>
      <div className="flex flex-col gap-1">
        <p className="text-lg text-text-primary">{title}</p>
        {description && <p className="text-sm leading-relaxed text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
