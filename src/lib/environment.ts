// Em que ambiente o app está, decidido pelo projeto Supabase que ele usa (VITE_SUPABASE_URL).
// Não depende de uma variável a mais que alguém poderia esquecer: o build que aponta para o banco
// de produção é produção, e qualquer outro projeto (o de dev, o de quem clonar) é desenvolvimento.
// Ao recriar o projeto de produção, troque o ref aqui (o `npm run check:prod` avisa).

/** Ref (o subdomínio de <ref>.supabase.co) dos projetos de produção. Não é segredo: está no site. */
export const PRODUCTION_PROJECT_REFS = ["fgrdscdymgsvmvjqibyn"]; // tododay-prod

export type AppEnvironment = "production" | "development";

/** O ref de uma URL do Supabase (https://<ref>.supabase.co) ou de uma connection string do Postgres. */
export function projectRef(url: string | undefined): string | null {
  return url?.match(/(?:postgres\.|db\.|https:\/\/)([a-z0-9]{20})(?![a-z0-9])/)?.[1] ?? null;
}

export function environmentOf(supabaseUrl: string | undefined): AppEnvironment {
  const ref = projectRef(supabaseUrl);
  return ref && PRODUCTION_PROJECT_REFS.includes(ref) ? "production" : "development";
}
