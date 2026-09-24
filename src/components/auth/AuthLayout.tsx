import type { ReactNode } from "react";
import { BrandMark } from "../ui/BrandMark";

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-screen flex-col items-center justify-center gap-6 bg-brand-hero px-4">
      <BrandMark light />
      <div className="w-full max-w-sm rounded-2xl bg-bg-surface p-8 shadow-card">
        <div className="mb-4 h-0.5 w-12 bg-danger" />
        <h1 className="mb-6 text-2xl font-normal tracking-tight text-text-primary">{title}</h1>
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
        className="w-full rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
      />
    </label>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full btn-primary px-3 py-2.5"
    >
      {busy ? "Aguarde..." : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mb-4 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{message}</p>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-text-primary">{children}</p>;
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-sm text-text-muted hover:text-primary">
      {children}
    </button>
  );
}
