import type { StatusCounts } from "../../types";
import {
  useCreateMember,
  useMemberRequestStats,
  useMembers,
  useStatusSummary,
} from "../../hooks/useMembers";
import { nextMemberColor } from "../../lib/memberColors";
import { CARD_STATUSES, STATUS_COLORS, STATUS_LABELS } from "../../lib/status";
import { MemberCard } from "./MemberCard";

interface TeamViewProps {
  onBack: () => void;
}

function sumCounts(counts: StatusCounts) {
  return counts.planned + counts.in_progress + counts.done;
}

export function TeamView({ onBack }: TeamViewProps) {
  const { data: members } = useMembers();
  const { data: summary } = useStatusSummary();
  const { data: requestStats } = useMemberRequestStats();
  const createMember = useCreateMember();

  const memberList = members ?? [];
  const rows = summary ?? [];
  const statsByMember = new Map((requestStats ?? []).map((s) => [s.member_id, s]));
  const totals: StatusCounts = {
    planned: rows.reduce((acc, r) => acc + r.planned, 0),
    in_progress: rows.reduce((acc, r) => acc + r.in_progress, 0),
    done: rows.reduce((acc, r) => acc + r.done, 0),
  };

  function handleAddMember() {
    createMember.mutate({ name: "Novo membro", color: nextMemberColor(memberList.map((m) => m.color)) });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto p-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-3 py-1 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary"
        >
          ← Voltar
        </button>
        <h1 className="text-2xl font-semibold text-text-primary">Equipe</h1>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-text-primary">Andamento</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-4 py-2 font-medium">Board</th>
                {CARD_STATUSES.map((status) => (
                  <th key={status} className="px-4 py-2 text-right font-medium" style={{ color: STATUS_COLORS[status] }}>
                    {STATUS_LABELS[status]}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.board_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-text-primary">{row.board_name}</td>
                  {CARD_STATUSES.map((status) => (
                    <td key={status} className="px-4 py-2 text-right tabular-nums">
                      {row[status]}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums">{sumCounts(row)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr className="border-t border-border font-semibold text-text-primary">
                  <td className="px-4 py-2">Total</td>
                  {CARD_STATUSES.map((status) => (
                    <td key={status} className="px-4 py-2 text-right tabular-nums">
                      {totals[status]}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums">{sumCounts(totals)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Membros</h2>
          <button
            type="button"
            onClick={handleAddMember}
            className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-on-accent hover:opacity-90"
          >
            + Membro
          </button>
        </div>
        {memberList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-muted">
            Nenhum membro ainda.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
            {memberList.map((member) => (
              <MemberCard key={member.id} member={member} stats={statsByMember.get(member.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
