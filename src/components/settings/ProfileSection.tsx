import { useEffect, useState } from "react";
import { AuthFailure } from "../../db/auth";
import { useProfile, useUpdateDisplayName, useUpdatePassword } from "../../hooks/useAuth";
import { nameError, passwordError } from "../../lib/profileRules";
import { useToast } from "../ui/Toast";
import { Row, Section } from "./SettingsView";

const INPUT = "w-72 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-primary";

/** Nome (vale em todo lugar: menu, avatares, responsáveis), e-mail e troca de senha. */
export function ProfileSection({ userId }: { userId: string }) {
  const { data: profile } = useProfile(userId);
  const updateName = useUpdateDisplayName(userId);
  const updatePassword = useUpdatePassword();
  const toast = useToast();

  const [name, setName] = useState("");
  useEffect(() => {
    if (profile) setName(profile.display_name);
  }, [profile]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordFailure, setPasswordFailure] = useState<string | null>(null);

  if (!profile) return null;

  const nameProblem = nameError(name);
  const nameUnchanged = name.trim() === profile.display_name;
  const passwordProblem = passwordError(password, confirm);

  function saveName() {
    if (nameProblem || nameUnchanged) return;
    updateName.mutate(name, {
      onSuccess: () => toast({ message: "Nome salvo" }),
      onError: () => toast({ message: "Não foi possível salvar o nome." }),
    });
  }

  function changePassword() {
    if (passwordProblem) return;
    setPasswordFailure(null);
    updatePassword.mutate(password, {
      onSuccess: () => {
        setPassword("");
        setConfirm("");
        toast({ message: "Senha trocada" });
      },
      onError: (err) =>
        setPasswordFailure(err instanceof AuthFailure ? err.message : "Não foi possível conectar. Verifique sua internet."),
    });
  }

  return (
    <Section title="Perfil">
      <Row label="Nome">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <input aria-label="Nome" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
          <button type="submit" disabled={!!nameProblem || nameUnchanged || updateName.isPending} className="btn-primary px-4 py-2 disabled:opacity-50">
            Salvar
          </button>
        </form>
        {nameProblem && name !== "" && <span className="text-xs text-danger">{nameProblem}</span>}
      </Row>

      <Row label="E-mail">
        <span className="text-sm text-text-primary">{profile.email}</span>
      </Row>

      <Row label="Trocar senha">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            changePassword();
          }}
        >
          <input
            type="password"
            aria-label="Nova senha"
            placeholder="Nova senha"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT}
          />
          <input
            type="password"
            aria-label="Confirmar senha"
            placeholder="Confirmar senha"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={INPUT}
          />
          {password !== "" && passwordProblem && <span className="text-xs text-text-muted">{passwordProblem}</span>}
          {passwordFailure && <span className="text-xs text-danger">{passwordFailure}</span>}
          <button type="submit" disabled={!!passwordProblem || updatePassword.isPending} className="btn-primary w-fit px-4 py-2 disabled:opacity-50">
            Trocar senha
          </button>
        </form>
      </Row>
    </Section>
  );
}
