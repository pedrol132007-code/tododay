import { describeActivity, relativeTime } from "../../lib/activity";
import type { Activity } from "../../types";

interface ActivityListProps {
  activities: Activity[] | undefined;
  where: "card" | "team";
}

export function ActivityList({ activities, where }: ActivityListProps) {
  if (!activities) return null;
  if (activities.length === 0) {
    return <p className="text-sm text-text-muted">Nada por aqui ainda.</p>;
  }
  return (
    <ol className="flex flex-col gap-2">
      {activities.map((activity) => (
        <li key={activity.id} className="text-sm leading-snug">
          <span className="font-medium text-text-primary">{activity.actor_name}</span>{" "}
          <span className="text-text-muted">{describeActivity(activity, where)}</span>
          <span
            className="ml-2 whitespace-nowrap text-xs text-text-muted/70"
            title={new Date(activity.created_at).toLocaleString("pt-BR")}
          >
            {relativeTime(activity.created_at)}
          </span>
        </li>
      ))}
    </ol>
  );
}
