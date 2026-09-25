import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconX } from "./icons";

interface ToastInput {
  message: string;
  /** Ex.: "Desfazer". Clicar executa e fecha o aviso. */
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastInput {
  id: number;
}

const DURATION_MS = 6000;
const MAX_VISIBLE = 3;

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

/** Avisos rápidos no canto da tela, que somem sozinhos (ex.: "Card arquivado · Desfazer"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((list) => [...list, { ...toast, id }].slice(-MAX_VISIBLE));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);

  // Pausa enquanto o mouse está em cima, para dar tempo de clicar em "Desfazer".
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [paused, onDismiss, toast.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.2 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="status"
      className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-bg-surface py-2 pl-4 pr-2 text-sm text-text-primary shadow-2xl"
    >
      <span className="h-4 w-0.5 bg-danger" />
      <span>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick();
            onDismiss(toast.id);
          }}
          className="rounded-lg px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary hover:bg-highlight hover:text-black"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Fechar aviso"
        className="rounded-lg p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
      >
        <IconX size={14} />
      </button>
    </motion.div>
  );
}

export function useToast(): (toast: ToastInput) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast precisa estar dentro de ToastProvider");
  return show;
}
