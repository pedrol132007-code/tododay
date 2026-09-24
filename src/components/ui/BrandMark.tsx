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
    </span>
  );
}
