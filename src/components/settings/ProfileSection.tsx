import { useEffect, useRef, useState } from "react";
import { AuthFailure } from "../../db/auth";
import { useProfile, useRemoveAvatar, useSetAvatar, useUpdateDisplayName, useUpdatePassword } from "../../hooks/useAuth";
import { avatarFileError } from "../../lib/avatarImage";
import { nameError, passwordError } from "../../lib/profileRules";
import { Avatar } from "../ui/Avatar";
import { useToast } from "../ui/Toast";
import { Row, Section } from "./SettingsView";

const INPUT = "w-72 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none focus:border-primary";

/** Nome (vale em todo lugar: menu, avatares, responsáveis), e-mail e troca de senha. */
export function ProfileSection({ userId }: { userId: string }) {
  const { data: profile } = useProfile(userId);
  const updateName = useUpdateDisplayName(userId);
  const updatePassword = useUpdatePassword();
  const toast = useToast();
  const setAvatar = useSetAvatar(userId);
  const removeAvatar = useRemoveAvatar(userId);
  const fileInput = useRef<HTMLInputElement>(null);

  function pickPhoto(file: File | undefined) {
    if (!file || !profile) return;
    const problem = avatarFileError(file);
    if (problem) return toast({ message: problem });
    setAvatar.mutate(
      { file, previousPath: profile.avatar_path },
      {
        onSuccess: () => toast({ message: "Foto salva" }),
        onError: () => toast({ message: "Não foi possível salvar a foto. Tente outra imagem." }),
      },
    );
  }

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
      <Row label="Foto">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar userId={userId} name={profile.display_name} avatarUrl={profile.avatar_url} large />
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              pickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={setAvatar.isPending}
            onClick={() => fileInput.current?.click()}
            className="btn-primary px-4 py-2 disabled:opacity-50"
          >
            {setAvatar.isPending ? "Enviando..." : profile.avatar_path ? "Trocar foto" : "Enviar foto"}
          </button>
          {profile.avatar_path && (
            <button
              type="button"
              disabled={removeAvatar.isPending}
              onClick={() =>
                removeAvatar.mutate(profile.avatar_path!, {
                  onSuccess: () => toast({ message: "Foto removida" }),
                  onError: () => toast({ message: "Não foi possível remover a foto." }),
                })
              }
              className="rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary disabled:opacity-50"
            >
              Remover foto
            </button>
          )}
        </div>
      </Row>

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
