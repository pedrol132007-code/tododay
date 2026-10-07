import { useState, type ReactNode } from "react";
import { initialEmailLink, initialLinkError, openedFromPasswordLink } from "../../db/auth";
import { useSession } from "../../hooks/useAuth";
import { AuthScreen } from "./AuthScreen";
import { EmailLinkScreen } from "./EmailLinkScreen";
import { SetPasswordScreen } from "./SetPasswordScreen";

export function AuthGate({ children }: { children: (userId: string) => ReactNode }) {
  const session = useSession();
  const [emailLink, setEmailLink] = useState(initialEmailLink);
  const [linkError, setLinkError] = useState(initialLinkError);
  const [needsPassword, setNeedsPassword] = useState(openedFromPasswordLink);

  // Antes da sessão: o link pode ser de outra pessoa que a logada neste navegador.
  if (emailLink) {
    return (
      <EmailLinkScreen
        link={emailLink}
        onDone={() => setEmailLink(null)}
        onFailed={(message) => {
          setEmailLink(null);
          setNeedsPassword(false);
          setLinkError(message);
        }}
      />
    );
  }
  if (session === undefined) {
    return <div className="h-screen w-screen bg-bg-base" />;
  }
  if (!session) {
    return <AuthScreen initialError={linkError} />;
  }
  if (needsPassword) {
    return <SetPasswordScreen onDone={() => setNeedsPassword(false)} />;
  }
  return <>{children(session.user.id)}</>;
}
