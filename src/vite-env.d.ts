/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Endereço público da versão web; obrigatório só no build desktop (ver publicUrl.ts). */
  readonly VITE_PUBLIC_URL?: string;
  /** DSN do Sentry (público). Sem ele, o Sentry não liga (ver src/sentry.ts). */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Versão do package.json, injetada pelo vite.config.ts.
declare const __APP_VERSION__: string;

// Commit publicado, injetado pelo vite.config.ts ("local" fora da Vercel).
declare const __APP_RELEASE__: string;
