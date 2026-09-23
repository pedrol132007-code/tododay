import { useState } from "react";
import { motion } from "framer-motion";
import type { Member, StatusCounts } from "../../types";
import type { MemberPatch } from "../../db/members";
import { useDeleteMember, useUpdateMember } from "../../hooks/useMembers";
import { MEMBER_COLORS } from "../../lib/memberColors";
import { InlineEditableText } from "../ui/InlineEditableText";

interface MemberCardProps {
  member: Member;
  stats?: StatusCounts;
}

export function MemberCard({ member, stats }: MemberCardProps) {
  const updateMember = useUpdateMember();
  const deleteMember = useDeleteMember();
  const [pickingColor, setPickingColor] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const total = stats ? stats.planned + stats.in_progress + stats.done : 0;
  const save = (patch: MemberPatch) => updateMember.mutate({ id: member.id, patch });

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 rounded-2xl border border-border bg-bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickingColor((v) => !v)}
            style={{ backgroundColor: member.color }}
            className="h-4 w-4 rounded-full"
            aria-label="Trocar cor"
          />
          {pickingColor && (
            <div className="absolute left-0 top-6 z-10 grid w-max grid-cols-5 gap-1 rounded-xl border border-border bg-bg-elevated p-2">
              {MEMBER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    save({ color });
                    setPickingColor(false);
                  }}
                  style={{ backgroundColor: color }}
                  className={`h-5 w-5 rounded-full ${color === member.color.toLowerCase() ? "ring-2 ring-text-primary" : ""}`}
                  aria-label={`Cor ${color}`}
                />
              ))}
            </div>
          )}
        </div>
        <InlineEditableText value={member.name} onSave={(name) => save({ name })} className="flex-1 font-semibold" />
        {confirmingDelete ? (
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => deleteMember.mutate(member.id)}
              className="rounded-lg bg-accent-pink px-2 py-1 text-bg-base"
            >
              Excluir
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-lg px-2 py-1 text-text-muted hover:bg-bg-elevated"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="rounded-lg px-1 text-text-muted hover:bg-accent-pink hover:text-bg-base"
            aria-label="Excluir membro"
          >
            ×
          </button>
        )}
      </div>
      {confirmingDelete && (
        <p className="text-xs text-text-muted">
          Os cards pedidos por {member.name} ficarão sem "pedido por".
        </p>
      )}
      <InlineEditableText
        value={member.role}
        onSave={(role) => save({ role })}
        placeholder="Função"
        allowEmpty
        className="text-sm"
      />
      <InlineEditableText
        value={member.contact}
        onSave={(contact) => save({ contact })}
        placeholder="Contato"
        allowEmpty
        className="text-sm"
      />
      <InlineEditableText
        value={member.notes}
        onSave={(notes) => save({ notes })}
        placeholder="Observações"
        allowEmpty
        className="text-sm"
      />
      <p className="px-2 text-xs text-text-muted">
        {total === 0
          ? "Nenhuma tarefa pedida"
          : `pediu ${total} · ${stats!.in_progress} em processo · ${stats!.done} finalizada${stats!.done === 1 ? "" : "s"}`}
      </p>
    </motion.div>
  );
}
