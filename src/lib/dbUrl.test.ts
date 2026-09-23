import { describe, expect, it } from "vitest";
import { dbUrlFor } from "./dbUrl";

// TAURI_ENV_DEBUG is set by the Tauri CLI from the Rust build profile, the same thing
// main.rs's cfg!(debug_assertions) reads — so both sides pick the same file in every mode.
describe("dbUrlFor", () => {
  it("uses the dev database for debug Rust builds", () => {
    expect(dbUrlFor("true")).toBe("sqlite:kanban-dev.db");
  });

  it("uses the real database for release Rust builds", () => {
    expect(dbUrlFor("false")).toBe("sqlite:kanban.db");
  });

  it("uses the real database when not launched by the Tauri CLI", () => {
    expect(dbUrlFor(undefined)).toBe("sqlite:kanban.db");
  });
});
