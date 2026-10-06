// Erros do app no Sentry. Liga só com VITE_SENTRY_DSN (Vercel em produção e .env.desktop); sem ela
// tudo aqui é no-op. Nada de dado pessoal: sem IP, sem e-mail, sem replay, usuário só pelo id e
// URLs sem query string (lib/sentryScrub.ts).
import * as Sentry from "@sentry/react";
import { isProduction } from "./db/supabase";
import { isNetworkError, scrubBreadcrumb, scrubEvent, toError } from "./lib/sentryScrub";

const dsn = import.meta.env.VITE_SENTRY_DSN;

export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: isProduction ? "production" : "development",
    release: __APP_RELEASE__,
    // O SDK já não coleta nada disso; o beforeSend/beforeBreadcrumb garante as URLs mesmo assim.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    // Não reescreve a mensagem "Failed to fetch" dentro do app (só no evento enviado).
    enhanceFetchErrorMessages: "report-only",
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
  Sentry.setTag("plataforma", "__TAURI_INTERNALS__" in window ? "desktop" : "web");
}

/** Erro que o app tratou (toast) mas que é bug: RLS negando, RPC falhando. Rede fica de fora. */
export function reportError(error: unknown): void {
  if (!dsn || isNetworkError(error)) return;
  Sentry.captureException(toError(error));
}

export function setSentryUser(id: string | null): void {
  if (dsn) Sentry.setUser(id ? { id } : null);
}
