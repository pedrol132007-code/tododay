// Formatos dos números do dashboard. Sem valor (divisão por zero) vira "—", nunca NaN.
export const num = (v: number, digits = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });
export const days = (v: number | null) => (v == null ? "—" : `${num(v, 1)} d`);
export const pct = (v: number | null) => (v == null ? "—" : `${num(v * 100)}%`);
