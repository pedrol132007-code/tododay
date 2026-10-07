// Links dos e-mails (convite, esqueci minha senha, confirmação) e do "Gerar link de acesso" abrem o
// app com #token_hash=...&type=... (modelos em supabase/templates/). O token só é gasto quando a
// pessoa clica no botão da tela (verifyOtp): antivírus de e-mail e prévias de chat abrem os links
// sozinhos, e com o link direto para o Supabase gastavam o token antes dela.

export type EmailLinkType = "invite" | "recovery" | "email";

export interface EmailLink {
  tokenHash: string;
  type: EmailLinkType;
}

const TYPES: EmailLinkType[] = ["invite", "recovery", "email"];

export function parseEmailLink(hash: URLSearchParams): EmailLink | null {
  const tokenHash = hash.get("token_hash");
  const type = hash.get("type") as EmailLinkType | null;
  if (!tokenHash || !type || !TYPES.includes(type)) return null;
  return { tokenHash, type };
}
