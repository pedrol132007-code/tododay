import { useEffect, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { appDataDir } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import type { AccentColor, ResolvedTheme, ThemePreference } from "../../types";
import { backupDatabase } from "../../db/backup";
import { backupErrorMessage, backupFileName } from "../../lib/backup";
import { ACCENT_COLORS, ACCENT_LABELS } from "../../lib/settings";
import { StatusBadge } from "../ui/StatusBadge";
import { useSettings } from "./SettingsProvider";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Automático" },
];

// Swatches show each accent as it looks in the current theme (same values as src/index.css);
// the page itself only has the *selected* accent in --accent, so the others need literals.
const ACCENT_SWATCH: Record<AccentColor, Record<ResolvedTheme, string>> = {
  purple: { dark: "#a78bfa", light: "#7c3aed" },
  blue: { dark: "#60a5fa", light: "#2563eb" },
  green: { dark: "#4ade80", light: "#15803d" },
  pink: { dark: "#f472b6", light: "#db2777" },
  orange: { dark: "#fb923c", light: "#c2410c" },
};

function Segmented<T extends string | boolean>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit rounded-xl border border-border bg-bg-elevated p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1 text-sm transition-colors ${
            o.value === value ? "bg-accent text-on-accent" : "text-text-muted hover:text-text-primary"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-bg-surface p-5">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-text-muted">{label}</span>
      {children}
    </div>
  );
}

export function SettingsView({ onBack }: { onBack: () => void }) {
  const { settings, resolvedTheme, update } = useSettings();
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    appDataDir().then(setDataDir).catch(() => setDataDir(null));
    getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

  async function handleBackup() {
    setDataMessage(null);
    try {
      const dest = await save({
        defaultPath: backupFileName(new Date()),
        filters: [{ name: "Banco do Tododay", extensions: ["db"] }],
      });
      if (!dest) return;
      setBackingUp(true);
      await backupDatabase(dest);
      setDataMessage({ ok: true, text: `Backup salvo em ${dest}` });
    } catch (error) {
      setDataMessage({ ok: false, text: backupErrorMessage(error) });
    } finally {
      setBackingUp(false);
    }
  }

  async function handleOpenFolder() {
    if (!dataDir) return;
    setDataMessage(null);
    try {
      await openPath(dataDir);
    } catch (error) {
      setDataMessage({ ok: false, text: `Não foi possível abrir a pasta: ${String(error)}` });
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
        >
          ← Voltar
        </button>
        <h1 className="text-2xl font-semibold text-text-primary">Configurações</h1>
      </div>

      <div className="flex max-w-2xl flex-col gap-6">
        <Section title="Aparência">
          <Row label="Tema">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented label="Tema" options={THEME_OPTIONS} value={settings.theme} onChange={(theme) => update({ theme })} />
              {settings.theme === "system" && (
                <span className="text-xs text-text-muted">(agora: {resolvedTheme === "dark" ? "escuro" : "claro"})</span>
              )}
            </div>
          </Row>

          <Row label="Cor de destaque">
            <div role="radiogroup" aria-label="Cor de destaque" className="flex gap-2">
              {ACCENT_COLORS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  role="radio"
                  aria-checked={settings.accent === accent}
                  aria-label={ACCENT_LABELS[accent]}
                  title={ACCENT_LABELS[accent]}
                  onClick={() => update({ accent })}
                  style={{ backgroundColor: ACCENT_SWATCH[accent][resolvedTheme] }}
                  className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-bg-surface ${
                    settings.accent === accent ? "ring-2 ring-text-primary" : ""
                  }`}
                />
              ))}
            </div>
          </Row>

          <Row label="Densidade dos cards">
            <Segmented
              label="Densidade dos cards"
              options={[
                { value: false, label: "Normal" },
                { value: true, label: "Compacto" },
              ]}
              value={settings.compact}
              onChange={(compact) => update({ compact })}
            />
            <div className="w-72 rounded-2xl border border-border bg-bg-base p-3">
              <div
                className={`flex flex-col rounded-xl border border-border bg-bg-elevated ${
                  settings.compact ? "gap-0.5 px-2 py-1 text-sm" : "gap-1 px-3 py-2"
                }`}
              >
                <span className="px-2 py-1 text-text-primary">Exemplo de tarefa</span>
                <div className="px-2">
                  <StatusBadge status="in_progress" compact={settings.compact} />
                </div>
              </div>
            </div>
          </Row>
        </Section>

        <Section title="Dados">
          <Row label="Pasta dos dados">
            <code className="select-text break-all rounded-lg bg-bg-elevated px-2 py-1 text-xs text-text-primary">
              {dataDir ?? "—"}
            </code>
          </Row>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleBackup}
              disabled={backingUp}
              className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
            >
              {backingUp ? "Salvando…" : "Fazer backup…"}
            </button>
            <button
              type="button"
              onClick={handleOpenFolder}
              disabled={!dataDir}
              className="rounded-lg border border-border px-3 py-1 text-sm text-text-primary hover:bg-bg-elevated disabled:opacity-50"
            >
              Abrir pasta dos dados
            </button>
          </div>
          {dataMessage && (
            <p className={`text-sm ${dataMessage.ok ? "text-text-muted" : "text-accent-pink"}`}>{dataMessage.text}</p>
          )}
        </Section>

        <Section title="Sobre">
          <p className="text-sm text-text-primary">Tododay{version ? ` v${version}` : ""}</p>
          <p className="text-sm text-text-muted">Seus dados ficam só neste computador.</p>
        </Section>
      </div>
    </div>
  );
}
