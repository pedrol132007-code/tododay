import { isProduction } from "../../db/supabase";

/** Símbolo "b" da Benner + nome do app. `light` para usar sobre o degradê da marca. */
export function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      {light ? (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
          <img src="/b-mark.svg" alt="" className="h-5 w-auto" />
        </span>
      ) : (
        <img src="/b-mark.svg" alt="" className="h-6 w-auto" />
      )}
      <span className={`text-base font-semibold tracking-tight ${light ? "text-white" : "text-text-primary"}`}>
        Tododay
      </span>
      {isProduction ? <BetaBadge /> : <DevBadge />}
    </span>
  );
}

/** Fora de produção, para nunca confundir o banco de teste com o da equipe. */
function DevBadge() {
  return (
    <span
      title="Ambiente de desenvolvimento: banco de teste, com a demonstração disponível"
      className="rounded bg-highlight px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider text-black"
    >
      Dev
    </span>
  );
}

/** Em produção, durante o piloto: avisa que é versão de teste e onde contar problemas. */
function BetaBadge() {
  return (
    <span
      title="Versão de teste. Achou um problema? Use Enviar feedback no menu."
      className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider text-on-accent"
    >
      Beta
    </span>
  );
}
