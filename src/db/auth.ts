import type { AuthError, Session } from "@supabase/supabase-js";
import { initialAuthHash, supabase } from "./supabase";
import type { Profile } from "../types";

// Links de e-mail voltam para a origem atual (em dev, http://localhost:1420),
// que precisa estar em Authentication → URL Configuration → Redirect URLs.
const redirectTo = window.location.origin;

const messages: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada.",
  user_already_exists: "Já existe uma conta com esse e-mail.",
  weak_password: "Senha fraca demais. Use pelo menos 6 caracteres.",
  same_password: "A nova senha precisa ser diferente da atual.",
  over_email_send_rate_limit: "Muitos e-mails enviados. Espere alguns minutos e tente de novo.",
  over_request_rate_limit: "Muitas tentativas. Espere alguns minutos e tente de novo.",
  otp_expired: "O link expirou ou já foi usado. Peça um novo.",
  validation_failed: "Confira o e-mail digitado.",
};

function toMessage(error: AuthError): string {
  return (error.code && messages[error.code]) || error.message;
}

export class AuthFailure extends Error {}

function fail(error: AuthError): never {
  throw new AuthFailure(toMessage(error));
}

/** Link de recuperação (ou convite, a partir da E6) abriu o app: o usuário precisa definir uma senha. */
export const openedFromPasswordLink = ["recovery", "invite"].includes(initialAuthHash.get("type") ?? "");

/** Erro vindo de um link de e-mail inválido/expirado, para mostrar na tela de login. */
export const initialLinkError: string | null = initialAuthHash.get("error_code")
  ? messages[initialAuthHash.get("error_code")!] ?? initialAuthHash.get("error_description")
  : null;

export async function signUp(email: string, password: string, displayName: string): Promise<void> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: redirectTo },
  });
  if (error) fail(error);
  // Com confirmação de e-mail ligada, um e-mail já cadastrado não dá erro:
  // o Supabase devolve um usuário sem identidades.
  if (data.user && data.user.identities?.length === 0) {
    throw new AuthFailure(messages.user_already_exists);
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) fail(error);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) fail(error);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) fail(error);
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail(error);
}

export function onSessionChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function getMyProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from("profile").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}
