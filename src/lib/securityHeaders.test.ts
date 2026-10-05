import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Os cabeçalhos de segurança vivem só no vercel.json (o vite preview lê o mesmo arquivo).
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const headers = new Map(vercel.headers.flatMap((h) => h.headers).map((h) => [h.key, h.value]));
const csp = headers.get("Content-Security-Policy") ?? "";

describe("cabeçalhos de segurança", () => {
  it("a CSP libera o script inline do tema pelo hash (mudou o script do index.html? atualize o hash)", () => {
    const html = readFileSync("index.html", "utf8");
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    for (const script of inline) {
      const hash = `'sha256-${createHash("sha256").update(script).digest("base64")}'`;
      expect(csp).toContain(hash);
    }
  });

  it("a CSP não libera script inline nem eval de qualquer origem", () => {
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("HTTPS obrigatório e os cabeçalhos básicos", () => {
    expect(headers.get("Strict-Transport-Security")).toMatch(/max-age=\d{8,}/);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBeTruthy();
  });
});
