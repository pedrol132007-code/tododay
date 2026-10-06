import type { ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { EmptyState } from "./EmptyState";
import { IconColumns } from "./icons";

/** Último recurso: um erro de renderização em qualquer tela mostra isto em vez da página em branco. */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      fallback={
        <div className="flex min-h-screen items-start justify-center bg-bg-base p-6">
          <EmptyState
            icon={<IconColumns size={22} />}
            title="Algo deu errado."
            description="O erro foi registrado. Recarregue a página para continuar."
            action={
              <button type="button" onClick={() => location.reload()} className="btn-primary px-4 py-2">
                Recarregar
              </button>
            }
          />
        </div>
      }
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
