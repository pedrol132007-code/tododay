/**
 * Endereço público do app, usado nos links que saem dele (convites, retorno dos e-mails).
 * No navegador é a própria origem; no desktop a origem é http://tauri.localhost, que não abre
 * para mais ninguém, então o build desktop define VITE_PUBLIC_URL com o endereço da Vercel.
 */
export function publicOrigin(configured: string | undefined, current: string): string {
  const url = configured?.trim().replace(/\/+$/, "");
  return url || current;
}
