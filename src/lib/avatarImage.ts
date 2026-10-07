// Foto de perfil: o navegador recorta o centro em quadrado e reduz para AVATAR_SIZE antes de enviar,
// então o arquivo no bucket fica com poucos KB, seja qual for a foto original.

export const AVATAR_SIZE = 256;
/** O que se aceita escolher (antes de reduzir). O bucket aceita no máximo 2 MB já reduzido. */
export const MAX_AVATAR_INPUT_BYTES = 15 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

export function avatarFileError(file: { type: string; size: number }): string | null {
  if (!TYPES.includes(file.type)) return "Use uma imagem PNG, JPG ou WebP.";
  if (file.size > MAX_AVATAR_INPUT_BYTES) return "Imagem grande demais (máximo 15 MB).";
  return null;
}

/** O maior quadrado centralizado que cabe na imagem. */
export function centerSquare(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

/** Recorta e reduz. WebP onde o navegador gera; senão o PNG que ele devolver (o bucket aceita os dois). */
export async function toAvatarBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { sx, sy, side } = centerSquare(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível ler a imagem."))), "image/webp", 0.85),
  );
}
