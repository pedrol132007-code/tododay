# Dashboard de desempenho da equipe — design

Data: 2026-09-25 · Branch: `feature/dashboard`

## Objetivo

Uma área **Dashboard** que mostra o desempenho da equipe ao longo do tempo, com uma visão da
equipe inteira e uma de cada membro. Ainda não há dados reais para isso (falta o status do
card), então um botão **Gerar demonstração** preenche o dashboard com dados aleatórios, só na
tela.

## Decisões (aprovadas na conversa)

- **Demonstração só na tela.** Nada vai para o banco, board ou histórico; some ao sair do
  dashboard. Selo "DEMONSTRAÇÃO" sempre visível enquanto ativa.
- **Pessoas fictícias na demonstração** (não os membros reais), para um número aleatório nunca
  ser atribuído a um colega real numa captura compartilhada.
- **Métricas:** entregas por semana, criados x concluídos, por pessoa (carga), prazo e agilidade.
- **Gráficos em SVG próprio**, sem biblioteca: poucos tipos, cores dos tokens do tema, sem peso
  no bundle do board (o dashboard carrega sob demanda).
- **Fonte real fica para depois** do status do card ("concluído" = status Finalizada). Agora só
  existe a fronteira de dados (`DashboardData`), que a fonte real vai preencher.

## Fora de escopo

- Fonte de dados real (depende de `2026-09-25-status-do-card-design.md`).
- Filtro por board, exportar CSV/imagem, metas configuráveis.
- Guardar a demonstração (recarregar a página ou sair da tela descarta).

## 1. Estrutura e navegação

- Botão **"Dashboard"** no cabeçalho, ao lado de "Equipe" → `view: "dashboard"` no `App.tsx`.
  Números da equipe inteira (todos os boards).
- Topo: `PageHeader` (rótulo "DASHBOARD", título = nome da equipe); à direita, período
  segmentado **4 | 12 | 26 semanas** (padrão 12) e o botão da demonstração.
- Abaixo, seletor de visão: **Equipe** + um chip por pessoa (avatar colorido + nome).
- **Visão da equipe**, três faixas:
  1. 4 blocos de número: entregas no período (variação vs. período anterior + minigráfico),
     saldo criados − concluídos, tempo médio para concluir (dias), % no prazo.
  2. Entregas por semana (colunas) | Criados x concluídos (duas linhas).
  3. Por pessoa (barras horizontais: entregues + em andamento) | Prazo e agilidade — **dois
     gráficos pequenos** (tempo médio; % no prazo), nunca eixo duplo.
- **Visão de um membro:** os mesmos blocos e gráficos só da pessoa, com a **média da equipe em
  cinza** como referência (ênfase: a pessoa em azul, o time em cinza). "Por pessoa" vira
  "Carga ao longo do tempo" (entregues x em andamento da pessoa por semana).
- **Sem dados:** `EmptyState` "O dashboard ainda não tem dados" + "As métricas reais chegam com
  o status do card." + botão **Gerar demonstração**.
- **Demonstração ativa:** selo laranja "DEMONSTRAÇÃO" ao lado do título, botões
  "Gerar de novo" e "Sair da demonstração".

## 2. Dados

### Formato (`src/types/index.ts`)

```ts
export interface DashboardPerson { id: string; name: string }

export interface DashboardWeek {
  personId: string;
  weekStart: string;      // "AAAA-MM-DD", segunda-feira
  created: number;
  delivered: number;
  inProgress: number;     // em andamento no fim da semana
  cycleDaysTotal: number; // soma dos dias até concluir, dos entregues (para a média)
  withDue: number;        // entregues que tinham prazo
  onTime: number;         // desses, entregues até o prazo
}

export interface DashboardData {
  people: DashboardPerson[];
  weeks: string[];        // semanas em ordem, a mais antiga primeiro
  rows: DashboardWeek[];  // uma por pessoa por semana
  isDemo: boolean;
}
```

### Cálculos — `src/lib/dashboard.ts` (puros, testados)

- `weeklySeries(data, weeks, personId?)` → por semana: created, delivered, inProgress,
  avgCycleDays, onTimeRate (da equipe somada, ou de uma pessoa).
- `teamAverageSeries(data, weeks)` → a média por pessoa, para a referência cinza.
- `summary(series)` → totais do período; `compare(current, previous)` → variação relativa
  (`null` quando o anterior é zero, exibida como "—").
- `perPerson(data, weeks)` → entregues e em andamento de cada pessoa no período, ordenado por
  entregues.
- Divisões por zero viram `null` (exibido como "—"), nunca `NaN`.

### Demonstração — `src/lib/demoData.ts` (pura, testada)

- `generateDemoData(seed, { weeks: 52, today })` → `DashboardData` com `isDemo: true`.
- PRNG com semente (mulberry32): mesma semente, mesmos dados. "Gerar de novo" troca a semente.
- 52 semanas (o período de 26 tem as 26 anteriores para comparar), terminando na semana de
  `today`.
- 5 pessoas fictícias (Ana Souza, Bruno Lima, Carla Dias, Diego Rocha, Elisa Prado), cada uma
  com perfil: capacidade base 3–8 entregas/semana, tendência leve, ruído semanal, ~1 semana de
  férias em 12 (zero entregas), tempo até concluir 2–9 dias, 60–95% no prazo.
- Criados ≈ entregues, com fases de acúmulo (backlog cresce e depois é drenado).
- Estado: `useState` no `DashboardView`; sair da tela descarta.

## 3. Visual, interação e acessibilidade

### Cores (validadas com o `validate_palette.js` da skill dataviz, claro e escuro)

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--chart-1` | `#2538FF` | `#5B6CFF` | série principal (= `primary`) |
| `--chart-2` | `#D9730D` | `#D9730D` | segunda série (criados; em andamento) |
| `--chart-ref` | `#6B7280` | `#6B7280` | média da equipe (referência) |
| grade/eixos | `border` / `text-muted` | idem | recessivos |

Todas passam faixa de luminosidade, croma, separação para daltonismo (ΔE ≥ 32) e contraste
≥ 3:1. O laranja `#FBA747` da marca reprovou (claro demais) e fica só para hover da UI.
Texto dos gráficos usa `text-primary`/`text-muted`, nunca a cor da série.

### Marcas (`src/components/dashboard/charts/`)

- `ColumnChart` (uma série, ou pessoa + referência): colunas finas, topo arredondado 4px,
  2px de espaço entre colunas, base no zero.
- `LineChart` (1–2 séries + referência opcional tracejada): linhas 2px, marcador ≥ 8px só no
  hover, rótulo direto no fim de cada linha.
- `HBarChart` (por pessoa): barras empilhadas entregues + em andamento, 2px de espaço entre
  segmentos, nome à esquerda, valores no fim.
- `StatTile`: valor grande, variação com seta e texto ("▲ 18% vs. 12 semanas anteriores",
  nunca só cor), minigráfico.
- Um eixo por gráfico, grade horizontal leve, eixo X com rótulos de semana ("8 set") espaçados.

### Interação

- Hover: linha guia vertical + dica com todos os valores da semana (linhas); dica por coluna/
  barra (área de acerto maior que a marca).
- Período e visão (equipe/pessoa) em uma linha acima dos gráficos; trocar a visão **não
  repinta** as séries (a cor segue a série, não a posição).
- Animações de entrada só com `motion-safe`.

### Acessibilidade

- Legenda sempre que houver 2+ séries, além do rótulo direto.
- Cada gráfico tem **"Ver tabela"**, que troca o SVG por uma tabela com os mesmos números.
- SVG com `role="img"` e `aria-label` resumindo ("Entregas por semana: 12 semanas, total 214,
  alta de 18%").
- Tema escuro com os valores próprios da tabela acima (não inversão automática).

## Arquivos

- Novos: `src/lib/dashboard.ts` (+ teste), `src/lib/demoData.ts` (+ teste),
  `src/components/dashboard/DashboardView.tsx`, `src/components/dashboard/charts/*`.
- Alterados: `src/types/index.ts` (tipos acima), `src/index.css` (tokens `--chart-*`),
  `tailwind.config.ts` (cores `chart-*`), `src/App.tsx` (botão e view, `lazy`).
- Sem mudança de banco.

## Testes

- Vitest: `dashboard.ts` (somas, média da equipe, variação, divisão por zero, período) e
  `demoData.ts` (determinismo por semente, 52 semanas × 5 pessoas, valores dentro das faixas,
  semanas começando na segunda).
- Playwright (`e2e/app.spec.ts`): abrir Dashboard → estado vazio → Gerar demonstração → selo
  visível → trocar período e pessoa → "Ver tabela" mostra linhas → Sair volta ao vazio.
  (Roda quando o `SUPABASE_DB_URL` local for atualizado; até lá, conferência por captura.)
- Captura dos dois temas conferida antes de concluir (sobreposição de rótulos, eixos).
