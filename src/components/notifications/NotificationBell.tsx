import { bellLabel } from "../../lib/notifications";
import { IconBell } from "../ui/icons";

/** Ao lado do menu da pessoa: abre a aba Notificações. O número fica sempre escrito. */
export function NotificationBell({ unread, active, onClick }: { unread: number; active: boolean; onClick: () => void }) {
  const label = bellLabel(unread);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ? `Notificações, ${unread} não lidas` : "Notificações"}
      aria-pressed={active}
      className={`relative mr-1 shrink-0 rounded-xl p-2 hover:bg-bg-elevated ${active ? "text-primary" : "text-text-muted hover:text-text-primary"}`}
    >
      <IconBell size={18} />
      {label && (
        <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-[1.1rem] text-on-accent">
          {label}
        </span>
      )}
    </button>
  );
}
