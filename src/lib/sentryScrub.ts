// O que vai para o Sentry (src/sentry.ts) passa por aqui. A query string do app tem nomes de
// pessoas (?responsavel=ana, ?pessoa=...) e a do Supabase tem ids e filtros: nenhuma URL sai com
// ?... ou #.... Usuário só pelo id. Sem dependência do SDK, para testar como função pura.

// Só os campos que a limpeza lê; os tipos do SDK (ErrorEvent, Breadcrumb) já se encaixam.
export type ScrubbableEvent = {
  request?: { url?: string; query_string?: unknown; headers?: Record<string, string> };
  user?: { id?: string | number };
};
export type ScrubbableBreadcrumb = { data?: Record<string, unknown> };

export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const out = { ...event };
  if (out.request) {
    const { query_string: _q, ...request } = out.request;
    if (request.url) request.url = stripQuery(request.url);
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).map(([k, v]) => [k, /^referer$/i.test(k) ? stripQuery(v) : v]),
      );
    }
    out.request = request;
  }
  if (out.user) out.user = out.user.id === undefined ? {} : { id: out.user.id };
  return out;
}

export function scrubBreadcrumb<B extends ScrubbableBreadcrumb>(crumb: B): B {
  if (!crumb.data) return crumb;
  const data = { ...crumb.data };
  for (const key of ["url", "from", "to"]) {
    if (typeof data[key] === "string") data[key] = stripQuery(data[key] as string);
  }
  return { ...crumb, data };
}

const NETWORK = /failed to fetch|networkerror|load failed|network request failed|fetch failed/i;

/** Falha de rede (offline, conexão caiu): não é bug, não vai para o Sentry. */
export function isNetworkError(error: unknown, online: boolean = navigator.onLine): boolean {
  if (!online) return true;
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  return NETWORK.test(message);
}

/** O Supabase lança objetos simples ({ message, code, details, hint }); o Sentry quer um Error. */
export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const code = "code" in error && error.code ? ` (${String(error.code)})` : "";
    const e = new Error(`${String(error.message)}${code}`);
    e.name = "SupabaseError";
    return e;
  }
  return new Error(error === undefined || error === null ? "Erro desconhecido" : String(error));
}
