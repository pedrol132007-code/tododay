/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Endereço público da versão web; obrigatório só no build desktop (ver publicUrl.ts). */
  readonly VITE_PUBLIC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Versão do package.json, injetada pelo vite.config.ts.
declare const __APP_VERSION__: string;
