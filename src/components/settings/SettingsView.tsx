import type { ReactNode } from "react";
import { usePreferences } from "../../hooks/usePreferences";
import type { Density, ThemePref } from "../../lib/preferences";
import { IconArrowLeft } from "../ui/icons";

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "compact", label: "Compacto" },
];

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-fit rounded-xl border border-border bg-bg-elevated p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1 text-sm transition-colors ${
            o.value === value ? "bg-primary text-on-accent" : "text-text-muted hover:text-text-primary"
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
  const { themePref, theme, density, setThemePref, setDensity } = usePreferences();
  const compact = density === "compact";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
        >
          <IconArrowLeft size={14} />
          Voltar
        </button>
        <h1 className="text-2xl font-semibold text-text-primary">Configurações</h1>
      </div>

      <div className="flex max-w-2xl flex-col gap-6">
        <Section title="Aparência">
          <Row label="Tema">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented label="Tema" options={THEME_OPTIONS} value={themePref} onChange={setThemePref} />
              {themePref === "system" && (
                <span className="text-xs text-text-muted">(agora: {theme === "dark" ? "escuro" : "claro"})</span>
              )}
            </div>
          </Row>

          <Row label="Densidade dos cards">
            <Segmented label="Densidade dos cards" options={DENSITY_OPTIONS} value={density} onChange={setDensity} />
            <div className={`w-72 rounded-2xl border border-border bg-bg-column ${compact ? "p-3" : "p-4"}`}>
              <div
                className={`rounded-xl border border-border bg-bg-card text-text-primary shadow-card ${
                  compact ? "px-2 py-1 text-sm" : "px-3 py-2"
                }`}
              >
                Exemplo de tarefa
              </div>
            </div>
          </Row>
        </Section>

        <Section title="Sobre">
          <p className="text-sm text-text-primary">Tododay v{__APP_VERSION__}</p>
          <p className="text-sm text-text-muted">Tema e densidade ficam salvos só neste navegador ou computador.</p>
        </Section>
      </div>
    </div>
  );
}
