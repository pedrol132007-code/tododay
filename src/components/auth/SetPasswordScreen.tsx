import { useState, type FormEvent } from "react";
import { AuthFailure, updatePassword } from "../../db/auth";
import { AuthLayout, Field, FormError, SubmitButton } from "./AuthLayout";

export function SetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmation) {
      setError("As senhas não são iguais.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      onDone();
    } catch (err) {
      setError(err instanceof AuthFailure ? err.message : "Não foi possível conectar. Verifique sua internet.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Definir senha">
      <form onSubmit={handleSubmit}>
        <FormError message={error} />
        <Field label="Nova senha" type="password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
        <Field label="Repita a senha" type="password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
        <SubmitButton busy={busy}>Salvar senha</SubmitButton>
      </form>
    </AuthLayout>
  );
}
