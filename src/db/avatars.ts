import { must, supabase } from "./supabase";

// Fotos de perfil no bucket público "avatars" (0016_leader_and_avatar.sql): "<user_id>/<uuid>.<ext>".

/** URL fixa da foto (o nome muda a cada troca, então pode ficar em cache para sempre). */
export function avatarPublicUrl(path: string | null): string | null {
  return path ? supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl : null;
}

const EXTENSION: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

/** Envia a foto nova, aponta o perfil para ela e só então apaga a antiga. */
export async function setMyAvatar(userId: string, image: Blob, previousPath: string | null): Promise<void> {
  const path = `${userId}/${crypto.randomUUID()}.${EXTENSION[image.type] ?? "png"}`;
  const { error } = await supabase.storage.from("avatars").upload(path, image, { contentType: image.type, cacheControl: "31536000" });
  if (error) throw error;
  must(await supabase.from("profile").update({ avatar_path: path }).eq("id", userId));
  // Se apagar falhar, sobra só um arquivo sem uso; o perfil já está certo.
  if (previousPath) await supabase.storage.from("avatars").remove([previousPath]);
}

export async function removeMyAvatar(userId: string, path: string): Promise<void> {
  must(await supabase.from("profile").update({ avatar_path: null }).eq("id", userId));
  await supabase.storage.from("avatars").remove([path]);
}
