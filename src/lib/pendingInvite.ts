// Convite por link: http://.../?convite=<token>.
//
// O token precisa sobreviver ao cadastro: a pessoa abre o link, cria a conta, confirma o
// e-mail (talvez em outro aparelho) e só então aceita. Por isso ele fica no localStorage
// e também vai no link de confirmação do e-mail (ver signUp em src/db/auth.ts).

const PARAM = "convite";
const STORAGE_KEY = "tododay.pendingInvite";

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(token: string | null) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sem storage o convite ainda funciona enquanto a página não for recarregada.
  }
}

let pending: string | null = (() => {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get(PARAM);
  if (!fromUrl) return readStored();
  store(fromUrl);
  // Tira o token da barra de endereço (preserva o #hash, que o Supabase ainda vai ler).
  url.searchParams.delete(PARAM);
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  return fromUrl;
})();

export function getPendingInvite(): string | null {
  return pending;
}

export function clearPendingInvite() {
  pending = null;
  store(null);
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/?${PARAM}=${token}`;
}

/** URL de volta dos e-mails de confirmação: carrega o convite junto, se houver. */
export function redirectUrlWithInvite(): string {
  return pending ? inviteUrl(pending) : window.location.origin;
}
