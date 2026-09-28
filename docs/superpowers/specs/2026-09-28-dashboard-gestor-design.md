# Dashboard do gestor — design

Data: 2026-09-28 · Branch: `feature/dashboard-gestor` · Evolui `2026-09-25-dashboard-design.md`.

## Objetivo

O dashboard passa a responder, em poucos segundos, à pergunta do **gestor** da equipe: *o que está
em risco e onde eu preciso agir?* Não é redesign: mesma identidade Benner (tokens atuais, azul e
vermelho, degradê da marca, cards, avatares) e os componentes que já existem.

## Decisões (aprovadas na conversa)

1. **Dados por tarefa.** `DashboardData` deixa de ser totais por semana e vira uma lista de
   tarefas com histórico de status. Todas as métricas saem dela, em funções puras testadas.
   Não muda o banco.
2. **Só demonstração por enquanto.** O banco não tem status, data de conclusão nem histórico de
   status (a proposta `2026-09-25-status-do-card-design.md` não foi implementada). Dados reais
   são uma etapa separada, com migration própria e aprovação.
3. **Gerador de demonstração reescrito** para produzir tarefas, mantendo os perfis atuais (5
   pessoas fictícias, capacidade, tendência, férias, ondas de acúmulo, épocas pesadas) e
   garantindo os cenários: atrasadas, vencendo em breve, paradas, alguém sobrecarregado, 52+
   semanas.
4. **Token `success` (verde)**, claro e escuro, para "mudança boa". Cor indica bom/ruim, não a
   direção da seta.
5. **Sobrecarga = mais de 8 em andamento** (limite fixo em `src/lib/dashboardRules.ts`).
6. **Cliques** (alertas, números) abrem uma lista filtrada dentro do dashboard enquanto não houver
   dados reais; o board filtrado depende de filtro no board + dados reais.
7. **Sem estimativa de tarefa:** carga é contagem, e o rótulo diz isso.
8. Sem bibliotecas novas. Datas personalizadas usam `<input type="date">`.

## Modelo (`src/types/index.ts`)

```ts
export type DashboardStatus = "planned" | "in_progress" | "done";
export interface DashboardStatusChange { day: string; to: DashboardStatus } // day = "AAAA-MM-DD"
export interface DashboardTask {
  id: string;
  title: string;
  assigneeId: string;
  createdDay: string;          // = history[0].day
  dueDay: string | null;
  history: DashboardStatusChange[]; // em ordem; começa em planned; done é final
}
export interface DashboardData { people: DashboardPerson[]; tasks: DashboardTask[]; today: string; since: string; isDemo: boolean }
// since = primeiro dia com dados completos (o período personalizado começa nele; sem período anterior completo, não há comparação)
```

Granularidade de dia: basta para "parada há 7 dias", tempo em dias e prazo, e evita fuso horário.

## Definições (`src/lib/dashboard.ts`)

- **Período**: intervalo de dias inclusivo `{ start, end }`. Atalhos terminam em `today`:
  7 dias, 30 dias, 12 semanas (84 dias), 6 meses (182 dias). Personalizado: duas datas,
  limitadas aos dados existentes. **Período anterior**: mesmo número de dias, logo antes.
- **Agrupamento dos gráficos**: até 31 dias, por dia; acima, blocos de 7 dias contados a partir do
  fim (o primeiro pode ser menor).
- **Entregue no período**: status final `done` com dia de conclusão no período.
- **Criada no período**: `createdDay` no período.
- **Backlog (KPI)**: criadas − entregues no período. Positivo = cresceu = ruim.
- **Estoque de backlog em um dia**: tarefas já criadas e ainda não concluídas naquele dia
  (planejadas + em andamento). O gráfico mostra o estoque no fim de cada bloco.
- **Tempo de conclusão**: dias entre criação e conclusão, das entregues no período.
  **Percentil 85** pelo método do posto mais próximo (`ceil(0,85·n)`), para a frase "85% das
  tarefas fecham em até X dias" ser literalmente verdade. Mediana como informação secundária.
- **No prazo**: das entregues no período que tinham prazo, as concluídas até o prazo (inclusive).
  Variação em pontos percentuais.
- **Em andamento**: status `in_progress` no dia (carga).
- **Atrasada**: não concluída e `dueDay < today`.
- **Vence em breve**: não concluída e prazo entre hoje e hoje + 3 dias.
- **Parada**: em andamento e sem mudança de status há mais de 7 dias. (Planejadas esperando na
  fila não contam: senão todo backlog vira alerta.)
- **Tom da variação**: `good` / `bad` / `neutral` conforme o sentido bom da métrica
  (entregas e no prazo: subir é bom; backlog e tempo: descer é bom). Variação nula = neutro.

## Fases

Cada fase termina com o app rodando, build e testes passando, capturas de tela e um resumo.

- **Fase 1 — Base.** Novo modelo e gerador; filtro de período global (menu "Últimas 12 semanas ▾"
  com os atalhos e Personalizado) controlando tudo; KPIs Entregas (igual), Backlog (+N, "entraram
  N a mais do que saíram"), Tempo de conclusão (p85 + mediana), No prazo (destaque, p.p.); cor por
  tom; gráfico "Backlog ao longo do tempo".
- **Fase 2 — Carga da equipe.** "Por pessoa" vira "Carga da equipe": barras horizontais de em
  andamento por pessoa, com atrasadas, paradas, % no prazo e entregas no período. Ordem por risco
  (atrasadas, depois carga). Sem posição, medalha ou cara de ranking. Rótulo "tarefas (contagem)".
- **Fase 3 — Atenção.** `src/lib/dashboardRules.ts` com os limites (vence em breve 3 dias, parada
  7 dias, sobrecarga 8) e as regras; card abaixo dos KPIs com até 5 alertas por gravidade,
  escritos como fatos de carga e risco; todos clicáveis; estado vazio positivo.
- **Fase 4 — Pessoa e integração.** "Dashboard · Nome" com tudo filtrado e a lista do que está
  parado e há quanto tempo; números clicáveis abrem a lista filtrada; Tempo e No prazo viram mini
  cards com sparkline, liberando espaço. *Implementado:* os dois gráficos pequenos saíram e a
  tendência deles virou sparkline dentro dos próprios KPIs de Tempo e No prazo (cards separados
  repetiriam o mesmo número). O espaço foi para a Carga da equipe, que subiu para logo abaixo do
  Atenção, e para o Backlog em largura total. Números clicáveis: Entregas, Backlog (abertas no fim),
  No prazo (entregues fora do prazo) e, na Carga, em andamento / atrasadas / paradas de cada pessoa.

## Testes

- Vitest: períodos e agrupamento, status num dia, percentil/mediana, métricas do período, estoque,
  tom, regras de alerta; gerador reproduzível pela semente e cobrindo todos os cenários em várias
  sementes.
- Playwright (`e2e/layout.spec.ts`, Supabase simulado): o dashboard continua sem rolar a página.
