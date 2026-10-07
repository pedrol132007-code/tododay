import { useState, type FormEvent } from "react";
import { AuthFailure, verifyEmailLink } from "../../db/auth";
import type { EmailLink } from "../../lib/emailLink";
import { AuthLayout, FormError, SubmitButton } from "./AuthLayout";

const COPY = {
  invite: { title: "Boas-vindas ao Tododay", text: "Você recebeu um convite para uma equipe.", button: "Criar minha senha" },
  recovery: { title: "Definir senha", text: "Clique para escolher uma nova senha.", button: "Definir nova senha" },
  email: { title: "Confirmar e-mail", text: "Clique para confirmar seu e-mail e entrar.", button: "Confirmar meu e-mail" },
};

/** Tira o token da barra de endereço: usado ou não, ele não serve para mais nada aqui. */
function clearLinkFromUrl() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

/**
 * Primeira tela de um link de e-mail (ver lib/emailLink.ts): o token só é gasto no clique, para
 * quem abre o link sem clicar (antivírus, prévia de chat) não invalidá-lo.
 */
export function EmailLinkScreen({ link, onDone, onFailed }: { link: EmailLink; onDone: () => void; onFailed: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[link.type];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyEmailLink(link);
      clearLinkFromUrl();
      onDone();
    } catch (err) {
      if (err instanceof AuthFailure) {
        clearLinkFromUrl();
        onFailed(err.message);
      } else {
        setError("Não foi possível conectar. Verifique sua internet.");
        setBusy(false);
      }
    }
  }

  return (
    <AuthLayout title={copy.title}>
      <p className="mb-4 text-sm text-text-muted">{copy.text}</p>
      <form onSubmit={handleSubmit}>
        <FormError message={error} />
        <SubmitButton busy={busy}>{copy.button}</SubmitButton>
      </form>
    </AuthLayout>
  );
}
