// Dados de demonstração do dashboard: aleatórios, mas reproduzíveis pela semente. Pessoas
// fictícias de propósito, para um número inventado nunca ser atribuído a um colega real.
import type { DashboardData, DashboardPerson, DashboardWeek } from "../types";

export const DEMO_PEOPLE: DashboardPerson[] = [
  { id: "demo-ana", name: "Ana Souza" },
  { id: "demo-bruno", name: "Bruno Lima" },
  { id: "demo-carla", name: "Carla Dias" },
  { id: "demo-diego", name: "Diego Rocha" },
  { id: "demo-elisa", name: "Elisa Prado" },
];

/** PRNG pequeno e determinístico (mulberry32): mesma semente, mesma sequência. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function generateDemoData(seed: number, options: { weeks?: number; today?: Date } = {}): DashboardData {
  const count = options.weeks ?? 52;
  const rand = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  // Soma de uniformes ≈ normal em torno de 0, amplitude ±1.5.
  const noise = () => rand() + rand() + rand() - 1.5;

  const lastMonday = mondayOf(options.today ?? new Date());
  const weeks = Array.from({ length: count }, (_, i) => {
    const d = new Date(lastMonday);
    d.setDate(d.getDate() - 7 * (count - 1 - i));
    return iso(d);
  });

  const rows: DashboardWeek[] = [];
  for (const person of DEMO_PEOPLE) {
    const capacity = between(3, 8);
    const trend = between(-0.35, 0.35); // variação total ao longo do ano
    const cycleBase = between(2, 9);
    const onTimeBase = between(0.6, 0.95);
    const phase = rand() * Math.PI * 2;
    let inProgress = Math.round(between(2, 6));

    weeks.forEach((weekStart, i) => {
      const progress = count > 1 ? i / (count - 1) : 1;
      const onVacation = rand() < 1 / 12;
      const delivered = onVacation
        ? 0
        : clamp(Math.round(capacity * (1 + trend * (progress - 0.5)) + noise() * 1.5), 0, 14);
      // Ondas de acúmulo: em parte do ano entra mais trabalho do que sai, depois o contrário.
      const wave = Math.sin(progress * Math.PI * 3 + phase);
      const created = clamp(Math.round((onVacation ? capacity * 0.4 : delivered) * (1 + 0.3 * wave) + noise()), 0, 16);
      inProgress = clamp(inProgress + created - delivered, 0, 15);

      let cycleDaysTotal = 0;
      for (let k = 0; k < delivered; k++) cycleDaysTotal += clamp(cycleBase + noise() * 2, 1, 12);
      const withDue = Math.round(delivered * between(0.6, 0.9));
      const onTime = Math.round(withDue * clamp(onTimeBase + noise() * 0.1, 0, 1));

      rows.push({
        personId: person.id,
        weekStart,
        created,
        delivered,
        inProgress,
        cycleDaysTotal: Math.round(cycleDaysTotal * 10) / 10,
        withDue,
        onTime,
      });
    });
  }

  return { people: DEMO_PEOPLE, weeks, rows, isDemo: true };
}
