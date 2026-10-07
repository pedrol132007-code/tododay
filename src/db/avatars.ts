import { supabase } from "./supabase";

// Fotos de perfil no bucket público "avatars" (0016_leader_and_avatar.sql): "<user_id>/<uuid>.<ext>".

/** URL fixa da foto (o nome muda a cada troca, então pode ficar em cache para sempre). */
export function avatarPublicUrl(path: string | null): string | null {
  return path ? supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl : null;
}
