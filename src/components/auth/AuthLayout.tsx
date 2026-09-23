import type { ReactNode } from "react";

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-surface p-8">
        <div className="mb-1 text-sm font-semibold text-accent-purple">Tododay</div>
        <h1 className="mb-6 text-xl font-semibold text-text-primary">{title}</h1>
        {children}
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}

export function Field({ label, type, value, onChange, autoComplete, autoFocus }: FieldProps) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-sm text-text-muted">{label}</span>
      <input
        required
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-purple"
      />
    </label>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-xl bg-accent-purple px-3 py-2 text-sm font-semibold text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {busy ? "Aguarde..." : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mb-4 rounded-xl bg-accent-pink/10 px-3 py-2 text-sm text-accent-pink">{message}</p>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-text-primary">{children}</p>;
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-sm text-text-muted hover:text-accent-purple">
      {children}
    </button>
  );
}
