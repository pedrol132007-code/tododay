import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar definidas no .env");
}

// Lido antes do createClient: o cliente consome e apaga o #hash dos links de e-mail
// (confirmação, recuperação de senha, convite) logo ao inicializar.
export const initialAuthHash = new URLSearchParams(window.location.hash.slice(1));

export const supabase = createClient(url, anonKey);
