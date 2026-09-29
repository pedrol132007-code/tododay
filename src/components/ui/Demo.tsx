/** Selo ao lado do título quando a tela mostra dados de demonstração. */
export function DemoBadge() {
  return <span className="rounded-lg bg-highlight px-2 py-1 text-xs font-semibold uppercase tracking-wider text-black">Demonstração</span>;
}

/** Os controles da demonstração, iguais no board e no dashboard. */
export function DemoActions({ onRegenerate, onExit }: { onRegenerate: () => void; onExit: () => void }) {
  return (
    <>
      <button type="button" onClick={onRegenerate} className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-bg-elevated">
        Gerar de novo
      </button>
      <button type="button" onClick={onExit} className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-bg-elevated hover:text-text-primary">
        Sair da demonstração
      </button>
    </>
  );
}
