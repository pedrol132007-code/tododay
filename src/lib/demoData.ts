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

  // Épocas mais pesadas para a equipe toda (fechamentos, prazos em lote): tudo demora mais.
  const teamPhase = rand() * Math.PI * 2;
  const teamStrain = (progress: number) => 1 + 0.07 * Math.sin(progress * Math.PI * 2.5 + teamPhase);

  const rows: DashboardWeek[] = [];
  for (const person of DEMO_PEOPLE) {
    const capacity = between(3, 8); // entregas por semana
    const trend = between(-0.35, 0.35); // variação total da capacidade ao longo do ano
    // Quanto trabalho a pessoa costuma ter aberto; a entrada de trabalho puxa o estoque de volta
    // para esse alvo, que sobe e desce em ondas de acúmulo.
    const targetWip = between(4, 9);
    const cycleBase = between(2, 9);
    const cycleTrend = between(-0.3, 0.3);
    const onTimeBase = between(0.65, 0.92);
    const onTimeTrend = between(-0.1, 0.1);
    const phase = rand() * Math.PI * 2;
    let inProgress = Math.round(targetWip);

    weeks.forEach((weekStart, i) => {
      const progress = count > 1 ? i / (count - 1) : 1;
      const onVacation = rand() < 1 / 12;
      const capacityNow = capacity * (1 + trend * (progress - 0.5));
      const wave = Math.sin(progress * Math.PI * 3 + phase);
      const target = targetWip * (1 + 0.3 * wave);
      // Contagens semanais oscilam mais ou menos como Poisson (desvio ≈ √média).
      const spread = Math.sqrt(capacityNow);
      const planned = onVacation ? 0 : clamp(Math.round(capacityNow + noise() * 1.6 * spread), 0, 14);
      // Parte do trabalho novo é puxada quando algo termina; o resto chega por conta própria.
      const arriving = onVacation ? capacityNow * 0.4 : 0.4 * planned + 0.6 * capacityNow;
      const created = Math.max(0, Math.round(arriving + 0.4 * (target - inProgress) + noise() * 1.3 * spread));
      // Não dá para entregar do que não está aberto: o que já estava em andamento mais parte do
      // que entrou na semana (o resto ainda nem começou).
      const delivered = Math.min(planned, inProgress + Math.round(created / 2));
      const wipBefore = inProgress;
      inProgress += created - delivered;

      // Mais trabalho aberto, mais tempo até concluir (a lei de Little, grosso modo).
      const load = (wipBefore + inProgress) / 2 / targetWip;
      const cycleNow = cycleBase * (1 + cycleTrend * (progress - 0.5)) * (0.7 + 0.3 * load) * teamStrain(progress);
      let cycleDaysTotal = 0;
      for (let k = 0; k < delivered; k++) cycleDaysTotal += clamp(cycleNow + noise() * 2, 1, 12);
      const withDue = Math.round(delivered * between(0.6, 0.9));
      // Quando o tempo até concluir sobe, sobra menos folga para o prazo.
      const onTimeNow = onTimeBase + onTimeTrend * (progress - 0.5) - 0.35 * (cycleNow / cycleBase - 1);
      const onTime = Math.round(withDue * clamp(onTimeNow + noise() * 0.1, 0, 1));

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
