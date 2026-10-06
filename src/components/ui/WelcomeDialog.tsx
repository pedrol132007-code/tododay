import { useEffect } from "react";
import { motion } from "framer-motion";

const KEY = "tododay.welcomed";

/** Primeira entrada neste navegador? Erro no localStorage (modo privado, bloqueado): não mostra. */
export function shouldWelcome(): boolean {
  try {
    return localStorage.getItem(KEY) === null;
  } catch {
    return false;
  }
}

export function markWelcomed(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Sem localStorage o painel volta na próxima vez; não há o que fazer.
  }
}

interface WelcomeDialogProps {
  name: string;
  isAdmin: boolean;
  onClose: () => void;
  onOpenMyTasks: () => void;
}

/** Painel do primeiro acesso: onde ficam cards, tarefas, busca e perfil (ou convites, para o admin). */
export function WelcomeDialog({ name, isAdmin, onClose, onOpenMyTasks }: WelcomeDialogProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const firstName = name.trim().split(/\s+/)[0] ?? "";
  const tips: [string, string][] = [
    ["Cards", "Crie cards na coluna, arraste entre colunas ou use Mover para…. Clique no card para prazo, responsável, checklist e anexos."],
    ["Minhas tarefas", "No menu com seu nome, tudo o que está com você, por prazo."],
    ["Busca", "Ctrl+K procura em todos os boards; / filtra o board aberto, e o filtro Eu mostra só os seus."],
    isAdmin
      ? ["Equipe", "Convide a equipe pelo menu, em Equipe. Se o e-mail não chegar, use Gerar link de acesso."]
      : ["Perfil", "Confira seu nome e troque a senha em Configurações."],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-border bg-bg-surface p-6"
      >
        <h2 id="welcome-title" className="text-lg font-semibold text-text-primary">
          Bem-vindo ao Tododay{firstName && `, ${firstName}`}
        </h2>
        <ul className="flex flex-col gap-3">
          {tips.map(([title, text]) => (
            <li key={title} className="text-sm">
              <span className="font-semibold text-text-primary">{title}: </span>
              <span className="text-text-muted">{text}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onOpenMyTasks}
            className="rounded-lg px-4 py-2 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          >
            Ver minhas tarefas
          </button>
          <button type="button" autoFocus onClick={onClose} className="btn-primary px-4 py-2">
            Começar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
