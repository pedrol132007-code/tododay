// Tarefas de demonstração do dashboard: aleatórias, mas reproduzíveis pela semente. Pessoas
// fictícias de propósito, para um número inventado nunca ser atribuído a um colega real.
//
// Simula dia a dia cada pessoa, com o mesmo perfil do gerador semanal anterior: capacidade que
// muda ao longo do ano, férias, ondas de acúmulo, épocas pesadas para a equipe toda e tempo de
// conclusão que cresce com a carga. Garante os cenários que o dashboard precisa mostrar: uma pessoa
// sobrecarregada, tarefas atrasadas, vencendo em breve e paradas.
import type { DashboardData, DashboardPerson, DashboardStatusChange, DashboardTask } from "../types";
import { isDueSoon, isInProgress, isOverdue, isOverloaded, stalledDays } from "./dashboardRules";
import { addDays, daysBetween } from "./metrics";

export const DEMO_PEOPLE: DashboardPerson[] = [
  { id: "demo-ana", name: "Ana Souza" },
  { id: "demo-bruno", name: "Bruno Lima" },
  { id: "demo-carla", name: "Carla Dias" },
  { id: "demo-diego", name: "Diego Rocha" },
  { id: "demo-elisa", name: "Elisa Prado" },
];

const TITLES = [
  "Revisar contrato de fornecedor",
  "Atualizar planilha de custos",
  "Preparar apresentação mensal",
  "Responder auditoria interna",
  "Conciliar notas fiscais",
  "Ajustar fluxo de aprovação",
  "Documentar processo de compras",
  "Levantar requisitos do cliente",
  "Corrigir cadastro de parceiros",
  "Validar relatório trimestral",
  "Organizar treinamento da equipe",
  "Mapear riscos do projeto",
  "Negociar renovação de licenças",
  "Revisar política de acesso",
  "Consolidar indicadores do mês",
  "Analisar pedido de reembolso",
  "Atualizar base de conhecimento",
  "Planejar migração de dados",
  "Testar integração com o ERP",
  "Elaborar parecer técnico",
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
/** 0 = domingo … 6 = sábado. */
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Segunda-feira útil seguinte, se o dia cair no fim de semana. */
const toWeekday = (day: string) => (weekday(day) === 6 ? addDays(day, 2) : weekday(day) === 0 ? addDays(day, 1) : day);

/** `n` dias úteis depois de `day` (fim de semana não conta). */
function addWeekdays(day: string, n: number): string {
  let d = addDays(day, Math.floor(n / 5) * 7); // cada 5 dias úteis = uma semana
  for (let left = n % 5; left > 0; ) {
    d = addDays(d, 1);
    if (weekday(d) !== 0 && weekday(d) !== 6) left--;
  }
  return d;
}

/** Durações em dias corridos viram dias úteis (5 de cada 7), para a entrega cair num dia útil sem acumular na segunda. */
const workdays = (calendarDays: number) => Math.max(1, Math.round((calendarDays * 5) / 7));

const WARMUP_WEEKS = 8;

export function generateDemoTasks(seed: number, options: { weeks?: number; today?: Date } = {}): DashboardData {
  const weeks = options.weeks ?? 52;
  const rand = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  // Soma de uniformes ≈ normal em torno de 0, amplitude ±1.5.
  const noise = () => rand() + rand() + rand() - 1.5;
  const poisson = (mean: number) => {
    const limit = Math.exp(-mean);
    let k = 0;
    for (let p = rand(); p > limit; p *= rand()) k++;
    return k;
  };

  const today = iso(options.today ?? new Date());
  const since = addDays(today, -(weeks * 7 - 1));
  const first = addDays(since, -WARMUP_WEEKS * 7);
  const totalDays = daysBetween(first, today) + 1;

  // Épocas mais pesadas para a equipe toda (fechamentos, prazos em lote): tudo demora mais.
  const teamPhase = rand() * Math.PI * 2;
  const teamStrain = (progress: number) => 1 + 0.07 * Math.sin(progress * Math.PI * 2.5 + teamPhase);
  // Uma pessoa sempre acumula mais do que dá conta: recebe mais e demora mais.
  const overloaded = Math.floor(rand() * DEMO_PEOPLE.length);

  const tasks: DashboardTask[] = [];
  DEMO_PEOPLE.forEach((person, index) => {
    const heavy = index === overloaded;
    const capacity = heavy ? between(7, 8) : between(3, 8); // tarefas por semana
    // Quem está sobrecarregado vem piorando: entra cada vez mais trabalho e demora cada vez mais.
    const trend = heavy ? between(0.1, 0.35) : between(-0.35, 0.35); // variação da capacidade ao longo do ano
    const cycleBase = heavy ? between(11, 13) : between(5, 10); // dias até concluir
    const cycleTrend = heavy ? between(0.1, 0.3) : between(-0.3, 0.3);
    const onTimeBase = between(0.65, 0.92);
    const onTimeTrend = between(-0.1, 0.1);
    const phase = rand() * Math.PI * 2;
    const lastWeek = Math.floor((totalDays - 1) / 7);
    // Quem está sobrecarregado não saiu de férias nas últimas semanas (senão a carga já teria caído).
    const vacationWeeks = new Set(
      Array.from({ length: lastWeek + 1 }, (_, w) => w).filter((w) => rand() < 1 / 12 && !(heavy && w > lastWeek - 6)),
    );
    const onVacation = (day: string) => vacationWeeks.has(Math.floor(daysBetween(first, day) / 7));
    /** Dias de conclusão das tarefas ainda abertas, para medir a carga. */
    let openDone: string[] = [];

    for (let i = 0; i < totalDays; i++) {
      const day = addDays(first, i);
      if (weekday(day) === 0 || weekday(day) === 6) continue;
      const progress = i / (totalDays - 1);
      const capacityNow = capacity * (1 + trend * (progress - 0.5));
      // Ondas de acúmulo: épocas em que entra bem mais trabalho, e depois bem menos.
      const wave = 1 + (heavy ? 0.15 : 0.45) * Math.sin(progress * Math.PI * 3 + phase);
      const arrivals = poisson((capacityNow / 5) * wave * (onVacation(day) ? 0.4 : 1));
      openDone = openDone.filter((d) => d > day);

      for (let k = 0; k < arrivals; k++) {
        // Mais trabalho aberto, mais tempo até concluir (a lei de Little, grosso modo).
        const load = openDone.length / Math.max(1, (capacityNow / 5) * cycleBase);
        const cycleNow = cycleBase * (1 + cycleTrend * (progress - 0.5)) * (0.75 + 0.25 * clamp(load, 0, 2)) * teamStrain(progress);
        const planned = Math.round(clamp(cycleNow * (1 + noise() * 0.5), 2, 25));
        // Uma parte trava no meio do caminho e demora muito mais (as "paradas", que estouram o prazo).
        const duration = rand() < (heavy ? 0.15 : 0.05) ? Math.round(planned * between(2.5, 5)) : planned;
        let done = addWeekdays(day, workdays(duration));
        // Nas férias ninguém entrega: fica para depois da volta.
        while (onVacation(done)) done = addDays(done, 7);
        done = toWeekday(done); // a volta das férias pode cair no fim de semana
        if (daysBetween(day, done) < 2) done = addWeekdays(done, 1); // sobra ao menos um dia em andamento
        // Fica planejada de 1 a 3 dias (nunca o tempo todo) antes de entrar em andamento.
        const started = addDays(day, Math.min(daysBetween(day, done) - 1, 1 + Math.floor(between(0, 3))));
        openDone.push(done);

        let dueDay: string | null = null;
        if (rand() < between(0.6, 0.9)) {
          // Quando o tempo até concluir sobe, sobra menos folga para o prazo.
          const onTimeNow = clamp(onTimeBase + onTimeTrend * (progress - 0.5) - 0.35 * (cycleNow / cycleBase - 1), 0.05, 0.98);
          // O prazo é combinado sobre o tempo previsto, não sobre o que aconteceu depois.
          const expected = addWeekdays(day, workdays(planned));
          const due = rand() < onTimeNow ? addDays(expected, Math.floor(between(0, 5))) : addDays(expected, -Math.ceil(between(1, 6)));
          dueDay = due > day ? due : addDays(day, 1);
        }

        const history: DashboardStatusChange[] = [{ day, to: "planned" }];
        if (started <= today) history.push({ day: started, to: "in_progress" });
        if (done <= today) history.push({ day: done, to: "done" });

        tasks.push({
          id: `demo-${tasks.length + 1}`,
          title: TITLES[Math.floor(rand() * TITLES.length)],
          assigneeId: person.id,
          createdDay: day,
          dueDay,
          history,
        });
      }
    }
  });

  return { people: DEMO_PEOPLE, tasks, today, since, isDemo: true };
}

/** A demonstração mostra todos os alertas e gráficos: atrasadas, vencendo em breve, paradas e alguém sobrecarregado. */
export function coversScenarios(d: DashboardData): boolean {
  const load = d.people.map((p) => d.tasks.filter((t) => t.assigneeId === p.id && isInProgress(t, d.today)).length);
  return (
    d.tasks.some((t) => isOverdue(t, d.today)) &&
    d.tasks.some((t) => isDueSoon(t, d.today)) &&
    d.tasks.some((t) => stalledDays(t, d.today) != null) &&
    load.some(isOverloaded)
  );
}

/**
 * Demonstração para a tela: a semente pedida ou, se ela não cobrir todos os cenários (raro, ~2%),
 * a próxima que cobre. Os números continuam saindo da simulação; só a semente muda.
 */
export function generateDemo(seed: number, options: { today?: Date } = {}): DashboardData {
  let d = generateDemoTasks(seed, options);
  for (let i = 1; i <= 50 && !coversScenarios(d); i++) d = generateDemoTasks(seed + i, options);
  return d;
}
