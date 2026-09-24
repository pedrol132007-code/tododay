import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthGate } from "./components/auth/AuthGate";
import { PreferencesProvider } from "./hooks/usePreferences";
import "./index.css";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <AuthGate>{(userId) => <App userId={userId} />}</AuthGate>
      </PreferencesProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
