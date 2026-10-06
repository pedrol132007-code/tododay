// Regras da seção Perfil (Configurações). O mínimo da senha é o mesmo do Auth (npm run auth:configurar).
export const NAME_MAX = 80;
export const PASSWORD_MIN = 8;

export function nameError(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "Digite seu nome.";
  if (name.length > NAME_MAX) return `Use no máximo ${NAME_MAX} caracteres.`;
  return null;
}

export function passwordError(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use pelo menos ${PASSWORD_MIN} caracteres.`;
  if (password !== confirm) return "As senhas não conferem.";
  return null;
}
