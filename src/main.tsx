import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthGate } from "./components/auth/AuthGate";
import { PreferencesProvider } from "./hooks/usePreferences";
import { ToastProvider } from "./components/ui/Toast";
import { isProduction } from "./db/supabase";
import "./index.css";

const queryClient = new QueryClient();

// A aba também avisa fora de produção (ver BrandMark).
if (!isProduction) document.title = "Tododay (dev)";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <ToastProvider>
          <AuthGate>{(userId) => <App userId={userId} />}</AuthGate>
        </ToastProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
