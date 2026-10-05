import { describe, expect, it } from "vitest";
import { environmentOf, projectRef } from "./environment";

describe("environmentOf", () => {
  it("o projeto de produção é produção", () => {
    expect(environmentOf("https://fgrdscdymgsvmvjqibyn.supabase.co")).toBe("production");
  });

  it("qualquer outro projeto é desenvolvimento", () => {
    expect(environmentOf("https://aakskemifuzzgkbwuiup.supabase.co")).toBe("development");
    expect(environmentOf("http://127.0.0.1:54321")).toBe("development");
  });

  it("sem URL é desenvolvimento", () => {
    expect(environmentOf(undefined)).toBe("development");
    expect(environmentOf("")).toBe("development");
  });
});

describe("projectRef", () => {
  it("lê o ref da URL do app e das connection strings do Postgres", () => {
    expect(projectRef("https://fgrdscdymgsvmvjqibyn.supabase.co")).toBe("fgrdscdymgsvmvjqibyn");
    expect(projectRef("postgresql://postgres.fgrdscdymgsvmvjqibyn:x@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"))
      .toBe("fgrdscdymgsvmvjqibyn");
    expect(projectRef("postgresql://postgres:x@db.fgrdscdymgsvmvjqibyn.supabase.co:5432/postgres")).toBe("fgrdscdymgsvmvjqibyn");
  });

  it("não aceita um ref maior que 20 caracteres", () => {
    expect(projectRef("https://fgrdscdymgsvmvjqibynx.supabase.co")).toBeNull();
  });
});
