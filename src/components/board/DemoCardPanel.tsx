import { useEffect } from "react";
import { motion } from "framer-motion";
import type { DashboardPerson, DashboardTask } from "../../types";
import type { DemoAttachment } from "../../lib/demoBoard";
import type { DemoFile } from "../../lib/demoFiles";
import { PRIORITY_LABEL } from "../../lib/boardVisuals";
import { AttachmentList } from "../card-detail/AttachmentList";
import { PanelSection } from "../card-detail/PanelSection";
import { Avatar } from "../ui/Avatar";
import { DemoBadge } from "../ui/Demo";
import { DueBadge } from "../ui/DueBadge";
import { IconX } from "../ui/icons";

/** Card da demonstração aberto, só leitura: o que o card tem e os anexos de exemplo. */
export function DemoCardPanel({ task, person, done, attachments, files, onClose }: {
  task: DashboardTask;
  person: DashboardPerson | undefined;
  /** Está na coluna Concluído (o prazo não alerta). */
  done: boolean;
  attachments: DemoAttachment[];
  files: Map<string, DemoFile>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.aside
        role="dialog"
        aria-label={task.title}
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 32, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="relative flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-border bg-bg-surface px-6 pb-6"
      >
        <div className="-mx-6 h-1 shrink-0 bg-brand-gradient" />
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col items-start gap-2">
            <DemoBadge />
            <h2 className="text-2xl font-normal leading-tight tracking-tight text-text-primary">{task.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:bg-bg-elevated hover:text-text-primary" aria-label="Fechar painel">
            <IconX size={18} />
          </button>
        </div>

        <dl className="grid grid-cols-[8rem_1fr] items-center gap-x-3 gap-y-3 text-sm">
          <dt className="text-text-muted">Responsável</dt>
          <dd className="flex items-center gap-2 text-text-primary">
            {person && <Avatar userId={person.id} name={person.name} avatarUrl={person.avatarUrl} leader={person.isLeader} />}
            {person?.name ?? "Ninguém"}
          </dd>
          <dt className="text-text-muted">Prioridade</dt>
          <dd className="text-text-primary">{task.priority ? PRIORITY_LABEL[task.priority] : "Sem prioridade"}</dd>
          <dt className="text-text-muted">Vencimento</dt>
          <dd>{task.dueDay ? <DueBadge due={task.dueDay} withLabel done={done} /> : <span className="text-text-primary">Sem prazo</span>}</dd>
          <dt className="text-text-muted">Etiquetas</dt>
          <dd className="text-text-primary">{task.labels.length > 0 ? task.labels.join(", ") : "Nenhuma"}</dd>
        </dl>

        <PanelSection title="Anexos" aside={attachments.length > 0 ? String(attachments.length) : undefined}>
          {attachments.length === 0 ? (
            <p className="text-sm text-text-muted">Nenhum anexo.</p>
          ) : (
            <>
              <AttachmentList
                items={attachments.map((a) => {
                  const file = files.get(a.id);
                  return {
                    key: a.id,
                    name: a.name,
                    isImage: a.kind === "image",
                    sizeBytes: file?.size ?? 0,
                    uploaderName: person?.name ?? "?",
                    day: a.day,
                    isCover: a.isCover,
                    url: file?.url,
                    downloadHref: file?.url,
                  };
                })}
              />
              <p className="text-xs text-text-muted">Arquivos fictícios, criados no seu navegador. Nada foi enviado.</p>
            </>
          )}
        </PanelSection>
      </motion.aside>
    </div>
  );
}
