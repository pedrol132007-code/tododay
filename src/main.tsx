import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { SettingsProvider } from "./components/settings/SettingsProvider";
import { applySettingsToDocument, loadSettings, systemPrefersDark } from "./lib/settingsStorage";
import "./index.css";

const queryClient = new QueryClient();

// Applied before the first render so a light-theme user never sees a dark flash.
const initialSettings = loadSettings();
applySettingsToDocument(initialSettings, systemPrefersDark());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider initial={initialSettings}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
