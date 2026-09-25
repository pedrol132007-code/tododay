import { describe, expect, it } from "vitest";
import { publicOrigin } from "./publicUrl";

describe("publicOrigin", () => {
  it("uses the configured public URL when there is one", () => {
    expect(publicOrigin("https://tododay.exemplo.com", "http://tauri.localhost")).toBe("https://tododay.exemplo.com");
  });

  it("drops trailing slashes and spaces from the configured URL", () => {
    expect(publicOrigin(" https://tododay.exemplo.com/ ", "http://tauri.localhost")).toBe("https://tododay.exemplo.com");
  });

  it("falls back to the current origin when nothing is configured", () => {
    expect(publicOrigin(undefined, "http://localhost:1420")).toBe("http://localhost:1420");
    expect(publicOrigin("", "http://localhost:1420")).toBe("http://localhost:1420");
  });
});
