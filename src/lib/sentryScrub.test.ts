import { describe, expect, it } from "vitest";
import { isNetworkError, scrubBreadcrumb, scrubEvent, stripQuery, toError } from "./sentryScrub";

describe("stripQuery", () => {
  it("tira query string e fragmento de URLs absolutas e relativas", () => {
    expect(stripQuery("https://tododay-nu.vercel.app/?responsavel=ana&atrasadas=1#x")).toBe("https://tododay-nu.vercel.app/");
    expect(stripQuery("/rest/v1/card?select=*&assignee_id=eq.123")).toBe("/rest/v1/card");
    expect(stripQuery("/board#card-3")).toBe("/board");
  });

  it("não mexe no que não tem query e nunca lança", () => {
    expect(stripQuery("https://x.supabase.co/rest/v1/card")).toBe("https://x.supabase.co/rest/v1/card");
    expect(stripQuery("")).toBe("");
    expect(stripQuery("::não é url?a=1")).toBe("::não é url");
  });
});

describe("scrubEvent", () => {
  it("limpa a URL da request, o Referer e a query_string, e deixa o usuário só com o id", () => {
    const event = scrubEvent({
      request: {
        url: "https://app/?pessoa=Ana%20Souza",
        query_string: "pessoa=Ana%20Souza",
        headers: { Referer: "https://app/?origem=dashboard", "User-Agent": "UA" },
      },
      user: { id: "u1", email: "a@b", ip_address: "1.2.3.4" },
    });
    expect(event.request).toEqual({ url: "https://app/", headers: { Referer: "https://app/", "User-Agent": "UA" } });
    expect(event.user).toEqual({ id: "u1" });
  });

  it("evento sem request nem user passa igual", () => {
    expect(scrubEvent({ message: "x", request: undefined, user: undefined })).toEqual({ message: "x" });
  });
});

describe("scrubBreadcrumb", () => {
  it("limpa navegação (from/to) e fetch/xhr (url)", () => {
    expect(scrubBreadcrumb({ category: "navigation", data: { from: "/?a=1", to: "/b?c=2" } }).data).toEqual({ from: "/", to: "/b" });
    expect(scrubBreadcrumb({ category: "fetch", data: { url: "/rest/v1/x?id=eq.1", method: "GET" } }).data).toEqual({ url: "/rest/v1/x", method: "GET" });
  });

  it("breadcrumb sem data passa igual", () => {
    expect(scrubBreadcrumb({ category: "ui.click", message: "button", data: undefined })).toEqual({ category: "ui.click", message: "button" });
  });
});

describe("isNetworkError", () => {
  it("reconhece falhas de rede dos navegadores", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"), true)).toBe(true);
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource."), true)).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"), true)).toBe(true);
    expect(isNetworkError({ message: "TypeError: Failed to fetch", code: "" }, true)).toBe(true);
  });

  it("offline é sempre rede", () => {
    expect(isNetworkError(new Error("qualquer"), false)).toBe(true);
  });

  it("erro do banco não é rede", () => {
    expect(isNetworkError({ message: "new row violates row-level security policy", code: "42501" }, true)).toBe(false);
    expect(isNetworkError(new Error("x is undefined"), true)).toBe(false);
    expect(isNetworkError(null, true)).toBe(false);
  });
});

describe("toError", () => {
  it("devolve o próprio Error", () => {
    const e = new Error("x");
    expect(toError(e)).toBe(e);
  });

  it("transforma o erro do Supabase (objeto simples) num Error com o code", () => {
    const e = toError({ message: "permission denied for table card", code: "42501", details: null, hint: null });
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("permission denied for table card (42501)");
    expect(e.name).toBe("SupabaseError");
  });

  it("qualquer outra coisa vira texto", () => {
    expect(toError("falhou").message).toBe("falhou");
    expect(toError(undefined).message).toBe("Erro desconhecido");
  });
});
