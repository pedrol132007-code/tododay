// Tarefas de demonstração do dashboard e do board: aleatórias, mas reproduzíveis pela semente.
// Pessoas fictícias de propósito, para um número inventado nunca ser atribuído a um colega real.
//
// Simula dia a dia cada pessoa: capacidade que muda ao longo do ano, férias, ondas de acúmulo,
// épocas pesadas para a equipe toda e tempo de conclusão que cresce com a carga. Cada pessoa tem um
// perfil, para os problemas ficarem espalhados: uma sobrecarregada, uma com tarefas paradas, uma com
// atrasos leves e duas em dia. Ninguém concentra todos os problemas.
import type { CardPriority, DashboardData, DashboardPerson, DashboardStatusChange, DashboardTask } from "../types";
import { demoAvatarUrl } from "./demoAvatars";
import { DEMO_DONE_DAYS, DEMO_LABELS, demoBoard, type DemoLabelId } from "./demoBoard";
import { isDueSoon, isInProgress, isOverdue, isOverloaded, isOverWip, localDay, STALLED_DAYS, stalledDays } from "./dashboardRules";
import { addDays, daysBetween, statusOn } from "./metrics";

// Ana é a líder (coroa). Parte da equipe tem foto e parte fica com as iniciais, para mostrar os dois.
export const DEMO_PEOPLE: DashboardPerson[] = [
  { id: "demo-ana", name: "Ana Souza", isLeader: true, avatarUrl: demoAvatarUrl("demo-ana", "Ana Souza") },
  { id: "demo-bruno", name: "Bruno Lima" },
  { id: "demo-carla", name: "Carla Dias", avatarUrl: demoAvatarUrl("demo-carla", "Carla Dias") },
  { id: "demo-diego", name: "Diego Rocha" },
  { id: "demo-elisa", name: "Elisa Prado", avatarUrl: demoAvatarUrl("demo-elisa", "Elisa Prado") },
];

// Títulos montados a partir de modelos, para o board não repetir o mesmo card. Nomes de empresas
// fictícios. {mes} é o mês em que a tarefa foi criada.
const SLOTS: Record<string, string[]> = {
  fornecedor: ["Alfa Logística", "TecnoPrint", "Serra Papéis", "Norte Transportes", "Vértice Energia", "Prisma Serviços"],
  cliente: ["Construtora Horizonte", "Rede Aurora", "Cooperativa Vale Verde", "Metalúrgica Sul", "Clínica Bem Viver", "Transportadora Rota Leste", "Farmácia Boa Saúde"],
  sistema: ["ERP", "CRM", "portal do cliente", "sistema de ponto", "BI", "app de vendas"],
  area: ["marketing", "TI", "operações", "RH", "comercial", "logística"],
  tema: ["LGPD", "segurança da informação", "viagens corporativas", "home office", "uso de equipamentos", "atendimento ao cliente"],
  item: ["notebooks", "licenças de software", "material de escritório", "cadeiras", "celulares", "monitores"],
};

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const TEMPLATES: { title: string; labels: DemoLabelId[] }[] = [
  { title: "Conciliar notas fiscais de {mes}", labels: ["financeiro"] },
  { title: "Fechar relatório de custos de {mes}", labels: ["financeiro"] },
  { title: "Consolidar indicadores de {mes}", labels: ["financeiro"] },
  { title: "Revisar orçamento de {area}", labels: ["financeiro"] },
  { title: "Aprovar pagamento da {fornecedor}", labels: ["financeiro", "compras"] },
  { title: "Analisar pedidos de reembolso de {area}", labels: ["financeiro", "pessoas"] },
  { title: "Revisar contrato com a {fornecedor}", labels: ["juridico", "compras"] },
  { title: "Elaborar parecer sobre {tema}", labels: ["juridico"] },
  { title: "Atualizar política de {tema}", labels: ["juridico", "pessoas"] },
  { title: "Revisar aditivo contratual da {cliente}", labels: ["juridico", "cliente"] },
  { title: "Cotar {item} com três fornecedores", labels: ["compras"] },
  { title: "Negociar renovação com a {fornecedor}", labels: ["compras"] },
  { title: "Emitir pedido de compra de {item}", labels: ["compras"] },
  { title: "Homologar a {fornecedor} como fornecedora", labels: ["compras", "juridico"] },
  { title: "Levantar requisitos com a {cliente}", labels: ["cliente"] },
  { title: "Preparar apresentação para a {cliente}", labels: ["cliente"] },
  { title: "Responder chamado da {cliente}", labels: ["cliente", "sistemas"] },
  { title: "Enviar proposta comercial para a {cliente}", labels: ["cliente", "financeiro"] },
  { title: "Mapear riscos do projeto da {cliente}", labels: ["cliente"] },
  { title: "Testar integração do {sistema}", labels: ["sistemas"] },
  { title: "Corrigir cadastros no {sistema}", labels: ["sistemas"] },
  { title: "Planejar migração de dados do {sistema}", labels: ["sistemas"] },
  { title: "Liberar acessos ao {sistema} para {area}", labels: ["sistemas", "pessoas"] },
  { title: "Organizar treinamento de {tema}", labels: ["pessoas"] },
  { title: "Fechar escala de {mes}", labels: ["pessoas"] },
  { title: "Documentar processo de {area}", labels: [] },
];

const LABEL_NAME = Object.fromEntries(DEMO_LABELS.map((l) => [l.id, l.name])) as Record<DemoLabelId, string>;

/** Chance de cada prioridade (o resto fica sem prioridade). */
const PRIORITY_ODDS: [CardPriority, number][] = [
  ["urgent", 0.05],
  ["high", 0.15],
  ["medium", 0.35],
  ["low", 0.15],
];

type Profile = "overloaded" | "stalled" | "late" | "healthy";

/** Um perfil por pessoa, sorteado a cada demonstração. */
const PROFILES: Profile[] = ["overloaded", "stalled", "late", "healthy", "healthy"];

interface ProfileParams {
  /** Tarefas por semana. */
  capacity: [number, number];
  /** Variação da capacidade ao longo do ano. */
  trend: [number, number];
  /** Dias até concluir. */
  cycle: [number, number];
  cycleTrend: [number, number];
  /** Chance de uma tarefa travar no meio do caminho (fica parada e demora muito mais). */
  stuck: number;
  /** Chance de entregar no prazo combinado. */
  onTime: [number, number];
  /** Amplitude das ondas de acúmulo. */
  wave: number;
}

const PARAMS: Record<Profile, ProfileParams> = {
  // Recebe mais do que dá conta e vem piorando: entra cada vez mais trabalho e demora cada vez mais.
  overloaded: { capacity: [6.5, 7.5], trend: [0.1, 0.35], cycle: [10, 12], cycleTrend: [0.1, 0.3], stuck: 0.12, onTime: [0.65, 0.85], wave: 0.15 },
  stalled: { capacity: [3.5, 5], trend: [-0.2, 0.2], cycle: [6, 9], cycleTrend: [-0.2, 0.2], stuck: 0, onTime: [0.7, 0.9], wave: 0.45 },
  late: { capacity: [4.5, 6], trend: [-0.3, 0.3], cycle: [6, 10], cycleTrend: [-0.3, 0.3], stuck: 0, onTime: [0.5, 0.7], wave: 0.3 },
  healthy: { capacity: [4, 6], trend: [-0.3, 0.3], cycle: [6, 10], cycleTrend: [-0.3, 0.3], stuck: 0, onTime: [0.85, 0.95], wave: 0.45 },
};

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
  const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
  // Soma de uniformes ≈ normal em torno de 0, amplitude ±1.5.
  const noise = () => rand() + rand() + rand() - 1.5;
  const poisson = (mean: number) => {
    const limit = Math.exp(-mean);
    let k = 0;
    for (let p = rand(); p > limit; p *= rand()) k++;
    return k;
  };

  const today = localDay(options.today ?? new Date());
  const since = addDays(today, -(weeks * 7 - 1));
  const first = addDays(since, -WARMUP_WEEKS * 7);
  const totalDays = daysBetween(first, today) + 1;

  // Épocas mais pesadas para a equipe toda (fechamentos, prazos em lote): tudo demora mais.
  const teamPhase = rand() * Math.PI * 2;
  const teamStrain = (progress: number) => 1 + 0.07 * Math.sin(progress * Math.PI * 2.5 + teamPhase);
  // Perfis embaralhados: cada demonstração põe os problemas em pessoas diferentes.
  const profiles = [...PROFILES];
  for (let i = profiles.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [profiles[i], profiles[j]] = [profiles[j], profiles[i]];
  }

  const tasks: DashboardTask[] = [];
  const profileOf = new Map<string, Profile>();
  DEMO_PEOPLE.forEach((person, index) => {
    const profile = profiles[index];
    profileOf.set(person.id, profile);
    const p = PARAMS[profile];
    const capacity = between(...p.capacity);
    const trend = between(...p.trend);
    const cycleBase = between(...p.cycle);
    const cycleTrend = between(...p.cycleTrend);
    const onTimeBase = between(...p.onTime);
    const onTimeTrend = between(-0.1, 0.1);
    const phase = rand() * Math.PI * 2;
    const lastWeek = Math.floor((totalDays - 1) / 7);
    // Ninguém saiu de férias nas últimas semanas: senão a carga de hoje já teria caído (ou tudo
    // estaria parado esperando a volta).
    const vacationWeeks = new Set(Array.from({ length: lastWeek + 1 }, (_, w) => w).filter((w) => rand() < 1 / 12 && w <= lastWeek - 6));
    const onVacation = (day: string) => vacationWeeks.has(Math.floor(daysBetween(first, day) / 7));
    // Quem tem o perfil de tarefas paradas pegou 2 ou 3 nas últimas semanas que travaram e seguem abertas.
    const forcedStuck = new Set(
      profile === "stalled" ? Array.from({ length: 2 + Math.floor(rand() * 2) }, () => toWeekday(addDays(today, -Math.floor(between(13, 26))))) : [],
    );
    /** Dias de conclusão das tarefas ainda abertas, para medir a carga. */
    let openDone: string[] = [];

    for (let i = 0; i < totalDays; i++) {
      const day = addDays(first, i);
      if (weekday(day) === 0 || weekday(day) === 6) continue;
      const progress = i / (totalDays - 1);
      const capacityNow = capacity * (1 + trend * (progress - 0.5));
      // Ondas de acúmulo: épocas em que entra bem mais trabalho, e depois bem menos.
      const wave = 1 + p.wave * Math.sin(progress * Math.PI * 3 + phase);
      const arrivals = poisson((capacityNow / 5) * wave * (onVacation(day) ? 0.4 : 1)) + (forcedStuck.has(day) ? 1 : 0);
      openDone = openDone.filter((d) => d > day);

      for (let k = 0; k < arrivals; k++) {
        // Mais trabalho aberto, mais tempo até concluir (a lei de Little, grosso modo).
        const load = openDone.length / Math.max(1, (capacityNow / 5) * cycleBase);
        const cycleNow = cycleBase * (1 + cycleTrend * (progress - 0.5)) * (0.75 + 0.25 * clamp(load, 0, 2)) * teamStrain(progress);
        const planned = Math.round(clamp(cycleNow * (1 + noise() * 0.5), 2, 25));
        // Uma parte trava no meio do caminho e demora muito mais (as "paradas", que estouram o prazo).
        const forced = k === 0 && forcedStuck.has(day);
        const duration = forced
          ? daysBetween(day, today) + Math.floor(between(5, 20))
          : rand() < p.stuck
            ? Math.round(planned * between(2.5, 5))
            : planned;
        let done = addWeekdays(day, workdays(duration));
        // Nas férias ninguém entrega: fica para depois da volta.
        while (onVacation(done)) done = addDays(done, 7);
        done = toWeekday(done); // a volta das férias pode cair no fim de semana
        if (daysBetween(day, done) < 2) done = addWeekdays(done, 1); // sobra ao menos um dia em andamento
        // Fica planejada de 1 a 3 dias antes de entrar em andamento. Quem não trava nunca passa
        // de STALLED_DAYS em andamento: o que demora mais esperou na fila, planejado.
        let started = addDays(day, Math.min(daysBetween(day, done) - 1, 1 + Math.floor(between(0, 3))));
        if (!forced && p.stuck === 0 && daysBetween(started, done) > STALLED_DAYS) started = addDays(done, -STALLED_DAYS);
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

        tasks.push({ id: `demo-${tasks.length + 1}`, title: "", assigneeId: person.id, createdDay: day, dueDay, priority: null, labels: [], history });
      }
    }
  });

  // Prazos do que está aberto hoje, pelo perfil: quem não tem atraso renegociou os vencidos para
  // os próximos dias úteis; quem tem atrasos leves fica com 1 a 3, vencidos há poucos dias.
  for (const person of DEMO_PEOPLE) {
    const open = tasks.filter((t) => t.assigneeId === person.id && statusOn(t, today) !== "done");
    const lateCount = profileOf.get(person.id) === "late" ? 1 + Math.floor(rand() * 3) : 0;
    // Atraso leve: venceu há 1 a 4 dias (nunca antes de a tarefa existir), e não está parada.
    const late = new Set(
      open
        .filter((t) => daysBetween(t.createdDay, today) >= 2 && stalledDays(t, today) == null)
        .sort((a, b) => a.createdDay.localeCompare(b.createdDay))
        .slice(0, lateCount),
    );
    for (const t of open) {
      if (late.has(t)) t.dueDay = addDays(today, -(1 + Math.floor(rand() * Math.min(4, daysBetween(t.createdDay, today) - 1))));
      else if (t.dueDay != null && t.dueDay < today) t.dueDay = addWeekdays(today, Math.floor(between(0, 8)));
    }
  }

  // Título, etiquetas e prioridade. O que aparece no board de hoje não repete título.
  const used = new Set<string>();
  const onBoard = (t: DashboardTask) => statusOn(t, today) !== "done" || daysBetween(t.history.at(-1)!.day, today) < DEMO_DONE_DAYS;
  for (const t of tasks) {
    const month = MONTHS[Number(t.createdDay.slice(5, 7)) - 1];
    let template = TEMPLATES[0];
    let title = "";
    for (let attempt = 0; attempt < 30; attempt++) {
      template = pick(TEMPLATES);
      title = template.title.replace(/\{(\w+)\}/g, (_, slot: string) => (slot === "mes" ? month : pick(SLOTS[slot])));
      if (!onBoard(t) || !used.has(title)) break;
    }
    if (onBoard(t)) used.add(title);
    t.title = title;
    // Uma parte fica sem etiqueta: nem todo mundo classifica tudo.
    t.labels = rand() < 0.12 ? [] : template.labels.map((id) => LABEL_NAME[id]);
    let r = rand();
    t.priority = PRIORITY_ODDS.find(([, odds]) => (r -= odds) < 0)?.[0] ?? null;
  }

  return { people: DEMO_PEOPLE, tasks, today, since, isDemo: true };
}

/**
 * A demonstração mostra todos os cenários, espalhados entre pessoas diferentes: uma pessoa (só uma)
 * sobrecarregada, sem atrasos; alguém com tarefas paradas (sem sobrecarga nem atrasos), alguém só
 * com atrasos, alguém em dia, prazos vencendo em breve e uma coluna do board acima do limite de
 * WIP. Ninguém tem os três problemas ao mesmo tempo.
 */
export function coversScenarios(d: DashboardData): boolean {
  const facts = d.people.map((p) => {
    const own = d.tasks.filter((t) => t.assigneeId === p.id);
    return {
      overloaded: isOverloaded(own.filter((t) => isInProgress(t, d.today)).length),
      overdue: own.some((t) => isOverdue(t, d.today)),
      stalled: own.some((t) => stalledDays(t, d.today) != null),
    };
  });
  return (
    facts.filter((f) => f.overloaded).length === 1 &&
    facts.some((f) => f.overloaded && !f.overdue) &&
    facts.some((f) => f.stalled && !f.overloaded && !f.overdue) &&
    facts.some((f) => f.overdue && !f.overloaded && !f.stalled) &&
    facts.some((f) => !f.overdue && !f.overloaded && !f.stalled) &&
    !facts.some((f) => f.overdue && f.overloaded && f.stalled) &&
    d.tasks.some((t) => isDueSoon(t, d.today)) &&
    demoBoard(d).some((l) => isOverWip(l.tasks.length, l.wipLimit))
  );
}

/**
 * Demonstração para a tela: a semente pedida ou, se ela não cobrir todos os cenários, a próxima
 * que cobre. Os números continuam saindo da simulação; só a semente muda.
 */
export function generateDemo(seed: number, options: { today?: Date } = {}): DashboardData {
  let d = generateDemoTasks(seed, options);
  for (let i = 1; i <= 50 && !coversScenarios(d); i++) d = generateDemoTasks(seed + i, options);
  return d;
}
