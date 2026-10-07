import { useState } from "react";
import { memberColor } from "../../lib/boardVisuals";
import { readableTextOn } from "../../lib/contrast";
import { IconCrown } from "./icons";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

interface AvatarProps {
  userId: string;
  name: string;
  title?: string;
  /** Casa com a altura do selo de prazo. */
  small?: boolean;
  /** Notificações, Equipe e Perfil. */
  large?: boolean;
  /** Foto (bucket "avatars" ou, na demonstração, uma imagem gerada). Sem ela, ou se falhar, as iniciais. */
  avatarUrl?: string | null;
  /** Coroa de líder no canto. */
  leader?: boolean;
}

/** Foto, ou iniciais numa bolinha com a cor fixa da pessoa (memberColor). */
export function Avatar({ userId, name, title, small = false, large = false, avatarUrl, leader = false }: AvatarProps) {
  const [broken, setBroken] = useState<string | null>(null);
  const color = memberColor(userId);
  const size = large ? "h-9 w-9 text-xs" : small ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]";
  const label = title ?? name;
  const showPhoto = avatarUrl && broken !== avatarUrl;
  return (
    <span title={leader && label ? `${label} · Líder` : label || undefined} className="relative inline-flex shrink-0">
      {showPhoto ? (
        <img src={avatarUrl} alt={name} onError={() => setBroken(avatarUrl)} className={`${size} rounded-full object-cover`} />
      ) : (
        <span
          style={{ backgroundColor: color, color: readableTextOn(color) }}
          className={`flex ${size} items-center justify-center rounded-full font-semibold`}
        >
          {initials(name)}
        </span>
      )}
      {leader && (
        <IconCrown
          size={large ? 14 : small ? 9 : 11}
          className="absolute -right-1 -top-1.5 rotate-12 text-highlight drop-shadow"
        />
      )}
    </span>
  );
}
