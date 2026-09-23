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

  it("points every status at a theme variable", () => {
    expect(STATUS_COLORS).toEqual({
      planned: "var(--status-planned)",
      in_progress: "var(--status-in-progress)",
      done: "var(--status-done)",
    });
  });
});
