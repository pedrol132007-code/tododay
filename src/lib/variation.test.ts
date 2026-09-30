import { describe, expect, it } from "vitest";
import { METRICS, MIN_CHANGE } from "./dashboardRules";
import { variation } from "./variation";

describe("variação: seta pela direção do número, cor pelo que é bom", () => {
  it("subir é bom: subiu fica verde com ▲", () => {
    const v = variation("delivered", 40, 31)!;
    expect(v).toMatchObject({ direction: "up", tone: "good", text: "▲ +9 tarefas vs. período anterior" });
  });

  it("subir é bom: caiu fica vermelho com ▼", () => {
    const v = variation("delivered", 28, 31)!;
    expect(v).toMatchObject({ direction: "down", tone: "bad", text: "▼ −3 tarefas vs. período anterior" });
  });

  it("subir é ruim: subiu fica vermelho, mas a seta continua ▲", () => {
    const v = variation("backlog", 36, 27)!;
    expect(v).toMatchObject({ direction: "up", tone: "bad", text: "▲ +9 tarefas no período" });
  });

  it("subir é ruim: caiu fica verde, com ▼", () => {
    const v = variation("backlog", 20, 36)!;
    expect(v).toMatchObject({ direction: "down", tone: "good", text: "▼ −16 tarefas no período" });
  });

  it("tempo de conclusão em dias, não em %, e sem 'mais lento' no texto", () => {
    const v = variation("cycleTime", 5.6, 5.2)!;
    expect(v).toMatchObject({ direction: "up", tone: "bad", text: "▲ +0,4 dia vs. período anterior" });
    expect(variation("cycleTime", 3, 5.5)!.text).toBe("▼ −2,5 dias vs. período anterior");
  });

  it("no prazo em pontos percentuais inteiros", () => {
    const v = variation("onTime", 0.83, 0.81)!;
    expect(v).toMatchObject({ direction: "up", tone: "good", text: "▲ +2 p.p. vs. período anterior" });
  });

  it("p.p. é a diferença das porcentagens como aparecem (arredondadas), não das taxas cruas", () => {
    // 95,6% e 88,4% aparecem como 96% e 88%: a variação tem de ser −8, não −7.
    expect(variation("onTime", 0.884, 0.956)!.text).toBe("▼ −8 p.p. vs. período anterior");
    // 83,49% e 82,51% aparecem os dois como 83%: sem diferença visível, estável.
    expect(variation("onTime", 0.8349, 0.8251)).toMatchObject({ direction: "flat", text: "estável vs. período anterior" });
  });

  it("singular com uma tarefa", () => {
    expect(variation("delivered", 11, 10)!.text).toBe("▲ +1 tarefa vs. período anterior");
  });

  it("de zero também compara (não some como na variação em %)", () => {
    expect(variation("delivered", 5, 0)!.text).toBe("▲ +5 tarefas vs. período anterior");
  });

  it("sem um dos valores não há variação", () => {
    expect(variation("delivered", 5, null)).toBeNull();
    expect(variation("onTime", null, 0.8)).toBeNull();
  });
});

describe("variação abaixo do limite mínimo é estável", () => {
  it("igual é estável e neutro, sem seta", () => {
    const v = variation("delivered", 10, 10)!;
    expect(v).toMatchObject({ direction: "flat", tone: "neutral", text: "estável vs. período anterior" });
    expect(variation("backlog", 27, 27)!.text).toBe("estável no período");
  });

  it("o limite vale depois do arredondamento: texto e cor nunca se contradizem", () => {
    // 0,04 dia arredonda para 0,0: não pode aparecer "▲ +0 dia" nem cor de piora.
    expect(variation("cycleTime", 5.24, 5.2)).toMatchObject({ direction: "flat", tone: "neutral" });
    // 0,4 p.p. arredonda para 0 p.p.
    expect(variation("onTime", 0.814, 0.81)).toMatchObject({ direction: "flat", tone: "neutral" });
  });

  it("no limite exato já conta como mudança", () => {
    expect(variation("cycleTime", 5.3, 5.2)).toMatchObject({ direction: "up", text: "▲ +0,1 dia vs. período anterior" });
    expect(MIN_CHANGE.days).toBe(0.1);
  });
});

describe("tooltip: a leitura em frase e os valores comparados", () => {
  it("backlog, dentro do período", () => {
    expect(variation("backlog", 36, 27)!.tooltip).toBe("O backlog aumentou — piora. Era 27 no início do período, agora 36.");
  });

  it("entregas, contra o período anterior", () => {
    expect(variation("delivered", 40, 31)!.tooltip).toBe("As entregas aumentaram — melhora. Período anterior: 31; este período: 40.");
  });

  it("tempo de conclusão explica o que a subida quer dizer", () => {
    expect(variation("cycleTime", 5.6, 5.2)!.tooltip).toBe(
      "O tempo de conclusão aumentou — piora: as tarefas estão levando mais tempo para fechar. Período anterior: 5,2 dias; este período: 5,6 dias.",
    );
  });

  it("dias sempre com uma casa, como o número do KPI", () => {
    expect(variation("cycleTime", 13, 11)!.tooltip).toContain("Período anterior: 11,0 dias; este período: 13,0 dias.");
  });

  it("taxa no prazo mostra as porcentagens", () => {
    expect(variation("onTime", 0.79, 0.81)!.tooltip).toBe("A taxa de entregas no prazo diminuiu — piora. Período anterior: 81%; este período: 79%.");
  });

  it("estável também diz os valores", () => {
    expect(variation("delivered", 10, 10)!.tooltip).toBe("As entregas ficaram estáveis. Período anterior: 10; este período: 10.");
  });
});

describe("configuração", () => {
  it("direção boa de cada métrica", () => {
    expect(METRICS.backlog.better).toBe("down");
    expect(METRICS.delivered.better).toBe("up");
    expect(METRICS.cycleTime.better).toBe("down");
    expect(METRICS.onTime.better).toBe("up");
    expect(METRICS.overdue.better).toBe("down");
    expect(METRICS.stalled.better).toBe("down");
  });
});
