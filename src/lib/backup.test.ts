import { describe, expect, it } from "vitest";
import { backupErrorMessage, backupFileName } from "./backup";

describe("backupFileName", () => {
  it("formats local date and time with zero padding", () => {
    expect(backupFileName(new Date(2026, 0, 5, 9, 7))).toBe("tododay-backup-2026-01-05-0907.db");
  });

  it("formats two-digit parts as-is", () => {
    expect(backupFileName(new Date(2026, 8, 23, 15, 12))).toBe("tododay-backup-2026-09-23-1512.db");
  });
});

describe("backupErrorMessage", () => {
  it("explains the SQLite error for an existing destination", () => {
    expect(backupErrorMessage("error returned from database: (code: 1) output file already exists")).toBe(
      "Esse arquivo já existe — escolha outro nome.",
    );
    expect(backupErrorMessage(new Error("output file already exists"))).toBe(
      "Esse arquivo já existe — escolha outro nome.",
    );
  });

  it("passes other errors through with a prefix", () => {
    expect(backupErrorMessage("disk full")).toBe("Não foi possível salvar o backup: disk full");
    expect(backupErrorMessage(new Error("denied"))).toBe("Não foi possível salvar o backup: denied");
  });
});
