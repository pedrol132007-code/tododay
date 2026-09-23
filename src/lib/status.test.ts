import { describe, expect, it } from "vitest";
import { CARD_STATUSES, STATUS_COLORS, STATUS_LABELS } from "./status";

describe("card statuses", () => {
  it("lists the three statuses in workflow order", () => {
    expect(CARD_STATUSES).toEqual(["planned", "in_progress", "done"]);
  });

  it("labels every status in Portuguese", () => {
    expect(STATUS_LABELS).toEqual({
      planned: "Planejada",
      in_progress: "Em processo",
      done: "Finalizada",
    });
  });

  it("gives every status a hex color", () => {
    for (const status of CARD_STATUSES) {
      expect(STATUS_COLORS[status]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
