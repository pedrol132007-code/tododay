import { createClient, type PostgrestError } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar definidas no .env");
}

// Lido antes do createClient: o cliente consome e apaga o #hash dos links de e-mail
// (confirmação, recuperação de senha, convite) logo ao inicializar.
export const initialAuthHash = new URLSearchParams(window.location.hash.slice(1));

export const supabase = createClient(url, anonKey);

/**
 * Desembrulha a resposta do Supabase: devolve os dados ou lança o erro.
 * Sem erro, select/insert...select/rpc sempre trazem dados; em update/delete sem select o
 * retorno é nulo, mas ninguém o usa.
 */
export function must<T>({ data, error }: { data: T; error: PostgrestError | null }): NonNullable<T> {
  if (error) throw error;
  return data as NonNullable<T>;
}
