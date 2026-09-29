import { memberColor } from "../../lib/boardVisuals";
import { readableTextOn } from "../../lib/contrast";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Iniciais numa bolinha com a cor fixa da pessoa (memberColor). `small` casa com a altura do selo de prazo. */
export function Avatar({ userId, name, title, small = false }: { userId: string; name: string; title?: string; small?: boolean }) {
  const color = memberColor(userId);
  return (
    <span
      title={title ?? name}
      style={{ backgroundColor: color, color: readableTextOn(color) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${small ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]"}`}
    >
      {initials(name)}
    </span>
  );
}
