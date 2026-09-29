import { describe, expect, it } from "vitest";
import { buildDemoPdf } from "./demoPdf";
import { checkAttachment } from "./attachmentRules";

describe("buildDemoPdf", () => {
  const bytes = buildDemoPdf("Contrato (exemplo) — Serra Papéis", ["Cláusula 1: prazo de 12 meses.", "Documento fictício."]);
  const text = new TextDecoder().decode(bytes);

  it("passa na mesma validação dos anexos de verdade", () => {
    expect(checkAttachment("contrato.pdf", bytes)).toMatchObject({ ok: true, mime: "application/pdf" });
  });

  it("é só ASCII, com acentos tirados e parênteses escapados", () => {
    expect([...bytes].every((b) => b < 0x80)).toBe(true);
    expect(text).toContain("(Contrato \\(exemplo\\)  Serra Papeis) Tj");
    expect(text).toContain("(Clausula 1: prazo de 12 meses.) '");
  });

  it("a tabela xref aponta para o começo de cada objeto", () => {
    const table = text.slice(text.indexOf("xref\n")).split("\n").slice(3, 8);
    table.forEach((row, i) => {
      const offset = Number(row.slice(0, 10));
      expect(text.slice(offset, offset + 7)).toBe(`${i + 1} 0 obj`);
    });
    const startxref = Number(text.split("startxref\n")[1].split("\n")[0]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
  });
});
