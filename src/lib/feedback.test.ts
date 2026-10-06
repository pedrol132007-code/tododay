import { describe, expect, it } from "vitest";
import { feedbackMailto } from "./feedback";

describe("link de feedback", () => {
  it("abre um e-mail para o app com assunto e a versão/plataforma no corpo, tudo codificado", () => {
    const link = feedbackMailto("1.0.0", "web");
    expect(link.startsWith("mailto:todoapp70@gmail.com?")).toBe(true);
    const params = new URLSearchParams(link.split("?")[1]);
    expect(params.get("subject")).toBe("Tododay — feedback");
    expect(params.get("body")).toBe("\n\n---\nTododay 1.0.0 (web)");
  });

  it("diz quando veio do desktop", () => {
    const params = new URLSearchParams(feedbackMailto("1.2.3", "desktop").split("?")[1]);
    expect(params.get("body")).toContain("Tododay 1.2.3 (desktop)");
  });

  it("espaços viram %20, não +, para o programa de e-mail não mostrar '+'", () => {
    expect(feedbackMailto("1.0.0", "web")).not.toContain("+");
  });
});
