import React from "react";
import ReactDOM from "react-dom/client";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthGate } from "./components/auth/AuthGate";
import { PreferencesProvider } from "./hooks/usePreferences";
import { ToastProvider } from "./components/ui/Toast";
import { isProduction } from "./db/supabase";
import { AppErrorBoundary } from "./components/ui/AppErrorBoundary";
import { initSentry, reportError } from "./sentry";
import "./index.css";

initSentry();

// Erros do Supabase nas queries e mutations viram toast nas telas; aqui também vão para o Sentry.
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportError }),
  mutationCache: new MutationCache({ onError: reportError }),
});

// A aba também avisa fora de produção (ver BrandMark).
if (!isProduction) document.title = "Tododay (dev)";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <PreferencesProvider>
          <ToastProvider>
            <AuthGate>{(userId) => <App userId={userId} />}</AuthGate>
          </ToastProvider>
        </PreferencesProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
