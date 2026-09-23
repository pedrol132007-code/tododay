import { describe, expect, it } from "vitest";
import { describeActivity, relativeTime } from "./activity";
import type { Activity } from "../types";

function activity(action: string, payload: Record<string, unknown> = {}): Activity {
  return {
    id: 1,
    team_id: 1,
    board_id: 1,
    card_id: 1,
    actor_id: "u",
    actor_name: "Ana",
    action,
    payload,
    created_at: "2026-09-23T12:00:00Z",
  };
}

describe("describeActivity", () => {
  it("omits the card title inside the card's own history", () => {
    expect(describeActivity(activity("card.moved", { title: "Login", from: "A fazer", to: "Feito" }), "card")).toBe(
      "moveu de A fazer para Feito",
    );
  });

  it("names the card in the team history", () => {
    expect(describeActivity(activity("card.moved", { title: "Login", from: "A fazer", to: "Feito" }), "team")).toBe(
      "moveu “Login” de A fazer para Feito",
    );
  });

  it("describes card creation with its list", () => {
    expect(describeActivity(activity("card.created", { title: "Login", list: "A fazer" }), "card")).toBe(
      "criou o card em A fazer",
    );
  });

  it("describes renames with the old title", () => {
    expect(describeActivity(activity("card.renamed", { title: "Novo", from: "Velho" }), "card")).toBe(
      "renomeou de “Velho” para “Novo”",
    );
  });

  it("formats due dates in pt-BR and handles clearing them", () => {
    expect(describeActivity(activity("card.due_date_changed", { title: "X", to: "2026-10-05" }), "card")).toBe(
      "mudou o vencimento para 05/10/2026",
    );
    expect(describeActivity(activity("card.due_date_changed", { title: "X", to: null }), "card")).toBe(
      "tirou o vencimento",
    );
  });

  it("describes assignment and checklist changes", () => {
    expect(describeActivity(activity("card.assigned", { title: "X", name: "Bia" }), "card")).toBe(
      "definiu Bia como responsável",
    );
    expect(describeActivity(activity("checklist.checked", { title: "X", item: "Testar" }), "card")).toBe(
      "marcou “Testar” no checklist",
    );
  });

  it("describes team events with role labels", () => {
    expect(describeActivity(activity("member.role_changed", { name: "Bia", from: "member", to: "admin" }), "team")).toBe(
      "mudou Bia de membro para admin",
    );
    expect(describeActivity(activity("member.left", { name: "Ana" }), "team")).toBe("saiu da equipe");
    expect(describeActivity(activity("invite.created", { label: "Carla", role: "viewer" }), "team")).toBe(
      "gerou um convite para Carla (leitor)",
    );
  });

  it("falls back to the raw action for unknown events", () => {
    expect(describeActivity(activity("something.new"), "team")).toBe("something.new");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-09-23T12:00:00Z");

  it("says 'agora' for the last minute", () => {
    expect(relativeTime("2026-09-23T11:59:30Z", now)).toBe("agora");
  });

  it("uses minutes, hours and days", () => {
    expect(relativeTime("2026-09-23T11:55:00Z", now)).toBe("há 5 min");
    expect(relativeTime("2026-09-23T09:00:00Z", now)).toBe("há 3 h");
    expect(relativeTime("2026-09-21T12:00:00Z", now)).toBe("há 2 dias");
  });

  it("falls back to the date after a week", () => {
    expect(relativeTime("2026-09-01T12:00:00Z", now)).toBe("01/09/2026");
  });
});
