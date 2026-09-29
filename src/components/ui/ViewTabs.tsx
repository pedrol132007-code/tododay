import type { AppView } from "./AppMenu";
import { IconChart, IconColumns } from "./icons";

/** A troca principal do app, sempre à vista: o board (e os arquivados dele) ou o dashboard. */
export function ViewTabs({ view, onNavigate }: { view: AppView; onNavigate: (view: AppView) => void }) {
  const tabs = [
    { target: "board" as const, label: "Board", icon: <IconColumns size={16} />, active: view === "board" || view === "archive" },
    { target: "dashboard" as const, label: "Dashboard", icon: <IconChart size={16} />, active: view === "dashboard" },
  ];
  return (
    <div className="mr-3 flex shrink-0 items-center gap-0.5 rounded-xl bg-bg-elevated p-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.target}
          type="button"
          onClick={() => onNavigate(tab.target)}
          aria-pressed={tab.active}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm transition-colors ${
            tab.active ? "bg-bg-surface font-semibold text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
