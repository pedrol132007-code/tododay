import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { initialEmailLink, initialLinkError, openedFromPasswordLink } from "../../db/auth";
import { useHasPassword, useSession } from "../../hooks/useAuth";
import { AuthScreen } from "./AuthScreen";
import { EmailLinkScreen } from "./EmailLinkScreen";
import { SetPasswordScreen } from "./SetPasswordScreen";

export function AuthGate({ children }: { children: (userId: string) => ReactNode }) {
  const session = useSession();
  const queryClient = useQueryClient();
  const [emailLink, setEmailLink] = useState(initialEmailLink);
  const [needsPassword, setNeedsPassword] = useState(openedFromPasswordLink);
  const userId = session?.user.id;
  const passwordCheck = useHasPassword(emailLink ? undefined : userId);

  // Antes da sessão: o link pode ser de outra pessoa que a logada neste navegador.
  if (emailLink) {
    return (
      <EmailLinkScreen
        link={emailLink}
        onDone={() => setEmailLink(null)}
        onFailed={() => {
          setEmailLink(null);
          setNeedsPassword(false);
        }}
      />
    );
  }
  if (session === undefined) {
    return <div className="h-screen w-screen bg-bg-base" />;
  }
  if (!session) {
    return <AuthScreen initialError={initialLinkError} />;
  }
  // Sem senha (abriu o convite e recarregou antes de criar), o app não abre: só a tela de senha.
  // Se a checagem falhar (rede), segue: a senha é só para não usarem conta sem senha.
  if (passwordCheck.isPending) {
    return <div className="h-screen w-screen bg-bg-base" />;
  }
  if (needsPassword || passwordCheck.data === false) {
    return (
      <SetPasswordScreen
        onDone={() => {
          queryClient.setQueryData(["hasPassword", userId], true);
          setNeedsPassword(false);
        }}
      />
    );
  }
  return <>{children(session.user.id)}</>;
}
