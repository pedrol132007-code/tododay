import { useState, type ReactNode } from "react";
import { initialLinkError, openedFromPasswordLink } from "../../db/auth";
import { useSession } from "../../hooks/useAuth";
import { AuthScreen } from "./AuthScreen";
import { SetPasswordScreen } from "./SetPasswordScreen";

export function AuthGate({ children }: { children: (userId: string) => ReactNode }) {
  const session = useSession();
  const [needsPassword, setNeedsPassword] = useState(openedFromPasswordLink);

  if (session === undefined) {
    return <div className="h-screen w-screen bg-bg-base" />;
  }
  if (!session) {
    return <AuthScreen initialError={initialLinkError} />;
  }
  if (needsPassword) {
    return <SetPasswordScreen onDone={() => setNeedsPassword(false)} />;
  }
  return <>{children(session.user.id)}</>;
}
