import { describe, expect, it } from "vitest";
import { nameError, passwordError } from "./profileRules";

describe("nome do perfil", () => {
  it("aceita nome normal e ignora espaços nas pontas", () => {
    expect(nameError("Ana Souza")).toBeNull();
    expect(nameError("  Ana  ")).toBeNull();
  });
  it("vazio ou só espaços não salva", () => {
    expect(nameError("")).toBe("Digite seu nome.");
    expect(nameError("   ")).toBe("Digite seu nome.");
  });
  it("mais de 80 caracteres não salva (contando depois do trim)", () => {
    expect(nameError("a".repeat(80))).toBeNull();
    expect(nameError(` ${"a".repeat(80)} `)).toBeNull();
    expect(nameError("a".repeat(81))).toBe("Use no máximo 80 caracteres.");
  });
});

describe("nova senha", () => {
  it("pelo menos 8 caracteres e as duas iguais", () => {
    expect(passwordError("12345678", "12345678")).toBeNull();
    expect(passwordError("1234567", "1234567")).toBe("Use pelo menos 8 caracteres.");
    expect(passwordError("12345678", "12345679")).toBe("As senhas não conferem.");
  });
});
