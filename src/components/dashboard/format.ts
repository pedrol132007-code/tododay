// Formatos dos números do dashboard. Sem valor (divisão por zero) vira "—", nunca NaN.
export const num = (v: number, digits = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
/** Por extenso ("5,7 dias"), para frases e dicas. */
export const days = (v: number | null) => (v == null ? "—" : `${num(v, 1)} ${Math.round(v * 10) === 10 ? "dia" : "dias"}`);
/** Só o número, quando a unidade já está no título ou cabeçalho. */
export const dayNum = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const pct = (v: number | null) => (v == null ? "—" : `${num(v * 100)}%`);
