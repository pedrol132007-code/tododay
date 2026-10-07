import type { AuthError, Session } from "@supabase/supabase-js";
import { initialAuthHash, supabase } from "./supabase";
import { avatarPublicUrl } from "./avatars";
import { appOrigin, redirectUrlWithInvite } from "../lib/pendingInvite";
import { parseEmailLink, type EmailLink } from "../lib/emailLink";
import type { Profile } from "../types";

// Links de e-mail voltam para a origem pública (em dev, http://localhost:1420; no desktop,
// VITE_PUBLIC_URL), que precisa estar em Authentication → URL Configuration → Redirect URLs.
const redirectTo = appOrigin;

const messages: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada.",
  user_already_exists: "Já existe uma conta com esse e-mail.",
  // O mínimo é configurado no painel (Authentication → Providers → Email → Minimum password length): 8.
  weak_password: "Senha fraca demais. Use pelo menos 8 caracteres.",
  same_password: "A nova senha precisa ser diferente da atual.",
  over_email_send_rate_limit: "Muitos e-mails enviados. Espere alguns minutos e tente de novo.",
  over_request_rate_limit: "Muitas tentativas. Espere alguns minutos e tente de novo.",
  otp_expired: "O link expirou ou já foi usado. Peça um novo.",
  validation_failed: "Confira o e-mail digitado.",
  reauthentication_needed: "Por segurança, saia e entre de novo para trocar a senha.",
};

function toMessage(error: AuthError): string {
  return (error.code && messages[error.code]) || error.message;
}

export class AuthFailure extends Error {}

function fail(error: AuthError): never {
  throw new AuthFailure(toMessage(error));
}

/** Link de e-mail que ainda não foi usado: a tela pede um clique antes de gastar o token. */
export const initialEmailLink: EmailLink | null = parseEmailLink(initialAuthHash);

/** Gasta o token do link (só no clique da pessoa) e entra na conta. */
export async function verifyEmailLink(link: EmailLink): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
  if (error) fail(error);
}

/** Link de recuperação (ou convite, a partir da E6) abriu o app: o usuário precisa definir uma senha. */
export const openedFromPasswordLink = ["recovery", "invite"].includes(initialAuthHash.get("type") ?? "");
/** Chegou pelo e-mail de convite: a tela de senha dá as boas-vindas. */
export const openedFromInvite = initialAuthHash.get("type") === "invite";

/** Erro vindo de um link de e-mail inválido/expirado, para mostrar na tela de login. */
export const initialLinkError: string | null = initialAuthHash.get("error_code")
  ? messages[initialAuthHash.get("error_code")!] ?? initialAuthHash.get("error_description")
  : null;

export async function signUp(email: string, password: string, displayName: string): Promise<void> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: redirectUrlWithInvite() },
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

/** Quem abriu o convite e recarregou antes de criar a senha ainda não tem senha (0019). */
export async function hasPassword(): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_password");
  if (error) throw error;
  return data !== false;
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail(error);
}

export function onSessionChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export type MyProfile = Profile & { avatar_url: string | null };

export async function getMyProfile(userId: string): Promise<MyProfile> {
  const { data, error } = await supabase.from("profile").select("*").eq("id", userId).single();
  if (error) throw error;
  return { ...data, avatar_url: avatarPublicUrl(data.avatar_path ?? null) };
}

/** A RLS só deixa cada um mudar o próprio nome (0001_profile.sql). */
export async function updateDisplayName(userId: string, name: string): Promise<void> {
  const { error } = await supabase.from("profile").update({ display_name: name.trim() }).eq("id", userId);
  if (error) throw error;
}
