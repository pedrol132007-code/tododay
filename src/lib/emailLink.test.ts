import { describe, expect, it } from "vitest";
import { parseEmailLink } from "./emailLink";

const hash = (s: string) => new URLSearchParams(s);

describe("parseEmailLink", () => {
  it("lê o token e o tipo", () => {
    expect(parseEmailLink(hash("token_hash=abc&type=invite"))).toEqual({ tokenHash: "abc", type: "invite" });
    expect(parseEmailLink(hash("token_hash=abc&type=recovery"))).toEqual({ tokenHash: "abc", type: "recovery" });
    expect(parseEmailLink(hash("token_hash=abc&type=email"))).toEqual({ tokenHash: "abc", type: "email" });
  });

  it("ignora links do formato antigo e tipos desconhecidos", () => {
    expect(parseEmailLink(hash("access_token=x&type=invite"))).toBeNull();
    expect(parseEmailLink(hash("token_hash=abc&type=magiclink"))).toBeNull();
    expect(parseEmailLink(hash("token_hash=&type=invite"))).toBeNull();
    expect(parseEmailLink(hash(""))).toBeNull();
  });
});
