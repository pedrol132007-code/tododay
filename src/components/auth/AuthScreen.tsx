import { useState, type FormEvent } from "react";
import { AuthFailure, requestPasswordReset, signIn, signUp } from "../../db/auth";
import { AuthLayout, Field, FormError, LinkButton, Notice, SubmitButton } from "./AuthLayout";
import { getPendingInvite } from "../../lib/pendingInvite";

type Mode = "login" | "signup" | "forgot";

const titles: Record<Mode, string> = {
  login: "Entrar",
  signup: "Criar conta",
  forgot: "Esqueci minha senha",
};

export function AuthScreen({ initialError }: { initialError: string | null }) {
  // Quem chega por link de convite quase sempre ainda não tem conta.
  const hasInvite = getPendingInvite() !== null;
  const [mode, setMode] = useState<Mode>(hasInvite ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSentTo(null);
    setPassword("");
    setConfirmation("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "signup" && password !== confirmation) {
      setError("As senhas não são iguais.");
      return;
    }
    setBusy(true);
    setError(null);
    const trimmedEmail = email.trim();
    try {
      if (mode === "login") {
        await signIn(trimmedEmail, password);
      } else if (mode === "signup") {
        await signUp(trimmedEmail, password, displayName.trim());
        setSentTo(trimmedEmail);
      } else {
        await requestPasswordReset(trimmedEmail);
        setSentTo(trimmedEmail);
      }
    } catch (err) {
      setError(err instanceof AuthFailure ? err.message : "Não foi possível conectar. Verifique sua internet.");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title={mode === "signup" ? "Confirme seu e-mail" : "Verifique seu e-mail"}>
        <Notice>
          {mode === "signup"
            ? <>Enviamos um link de confirmação para <strong>{sentTo}</strong>. Clique nele para ativar sua conta.</>
            : <>Se existir uma conta com <strong>{sentTo}</strong>, enviamos um link para definir uma nova senha.</>}
        </Notice>
        <div className="mt-6">
          <LinkButton onClick={() => switchMode("login")}>Voltar para o login</LinkButton>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={titles[mode]}>
      {hasInvite && mode !== "forgot" && (
        <p className="mb-4 rounded-xl bg-accent-purple/10 px-3 py-2 text-sm text-text-primary">
          Você recebeu um convite para uma equipe.{" "}
          {mode === "signup" ? "Crie sua conta para aceitar." : "Entre para aceitar."}
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <FormError message={error} />
        {mode === "signup" && (
          <Field label="Seu nome" type="text" value={displayName} onChange={setDisplayName} autoComplete="name" autoFocus />
        )}
        <Field label="E-mail" type="email" value={email} onChange={setEmail} autoComplete="email" autoFocus={mode !== "signup"} />
        {mode !== "forgot" && (
          <Field
            label="Senha"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        )}
        {mode === "signup" && (
          <Field label="Repita a senha" type="password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
        )}
        <SubmitButton busy={busy}>
          {mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
        </SubmitButton>
      </form>
      <div className="mt-6 flex flex-col items-start gap-2">
        {mode === "login" ? (
          <>
            <LinkButton onClick={() => switchMode("signup")}>Não tem conta? Criar conta</LinkButton>
            <LinkButton onClick={() => switchMode("forgot")}>Esqueci minha senha</LinkButton>
          </>
        ) : (
          <LinkButton onClick={() => switchMode("login")}>Já tenho conta. Entrar</LinkButton>
        )}
      </div>
    </AuthLayout>
  );
}
