// Formato do board enquanto colunas e cards carregam, no lugar de um "Carregando..." solto.
const COLUMNS = [3, 2, 1];

export function BoardSkeleton() {
  return (
    <div className="flex items-start gap-4 motion-safe:animate-pulse" role="status" aria-label="Carregando o board">
      {COLUMNS.map((cards, i) => (
        <div key={i} className="flex w-72 shrink-0 flex-col gap-3 rounded-2xl border border-border bg-bg-column p-4">
          <div className="h-5 w-24 rounded bg-border/60" />
          {Array.from({ length: cards }, (_, j) => (
            <div key={j} className="flex flex-col gap-2 rounded-xl border border-border bg-bg-card px-3 py-3">
              <div className="h-3.5 w-5/6 rounded bg-border/60" />
              <div className="h-3.5 w-1/2 rounded bg-border/60" />
            </div>
          ))}
          <div className="h-8 rounded-lg bg-border/60" />
        </div>
      ))}
    </div>
  );
}
