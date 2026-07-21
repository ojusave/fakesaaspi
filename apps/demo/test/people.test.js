import { describe, expect, it } from "vitest";
import { buildPeople } from "../src/people.js";

function eventSource(events) {
  return {
    exportJsonl() {
      return events.map((event) => JSON.stringify(event)).join("\n");
    },
  };
}

describe("people dashboard", () => {
  it("always assigns a complete fake name", () => {
    const result = buildPeople(
      eventSource([
        {
          sessionId: "fm1.mrtcoo09.2c8322f3-39bd-49d4-a40b-deaf498fbc77",
          type: "session_start",
          ts: 1_000,
        },
      ]),
      2_000,
    );

    expect(result.people[0].name).not.toContain("undefined");
    expect(result.people[0].name.split(" ")).toHaveLength(2);
  });

  it("freezes elapsed time when a session closes", () => {
    const source = eventSource([
      { sessionId: "closed-session", type: "session_start", ts: 1_000 },
      { sessionId: "closed-session", type: "page_view", step: "welcome", ts: 2_000 },
      { sessionId: "closed-session", type: "bye", ts: 5_000 },
    ]);

    const first = buildPeople(source, 10_000).people[0];
    const later = buildPeople(source, 20_000).people[0];

    expect(first.status).toBe("closed");
    expect(first.totalMs).toBe(4_000);
    expect(first.stepMs).toBe(3_000);
    expect(later.totalMs).toBe(first.totalMs);
    expect(later.stepMs).toBe(first.stepMs);
  });

  it("freezes elapsed time at shipment even when heartbeats continue", () => {
    const result = buildPeople(
      eventSource([
        { sessionId: "shipped-session", type: "session_start", ts: 1_000 },
        { sessionId: "shipped-session", type: "page_view", step: "fakegpt_deploy", ts: 3_000 },
        { sessionId: "shipped-session", type: "shipped", ts: 7_000 },
        { sessionId: "shipped-session", type: "heartbeat", ts: 12_000 },
      ]),
      20_000,
    ).people[0];

    expect(result.status).toBe("shipped");
    expect(result.totalMs).toBe(6_000);
    expect(result.stepMs).toBe(4_000);
  });

  it("exposes bounded aggregate evidence without session identifiers", () => {
    const result = buildPeople(
      eventSource([
        { sessionId: "session-one", type: "session_start", ts: 1_000 },
        { sessionId: "session-one", type: "page_view", step: "company_email", ts: 2_000 },
        { sessionId: "session-one", type: "step_error", step: "company_email", code: "freemail", attempt: 1, ts: 3_000 },
        { sessionId: "session-one", type: "step_error", step: "company_email", code: "freemail", attempt: 2, ts: 4_000 },
        { sessionId: "session-two", type: "session_start", ts: 2_000 },
        { sessionId: "session-two", type: "page_view", step: "phone", ts: 3_000 },
        { sessionId: "session-two", type: "step_error", step: "phone", code: "format", attempt: 1, ts: 4_000 },
      ]),
      5_000,
      {
        totals: {
          started: 2,
          activeNow: 2,
          shipped: 0,
          closed: 0,
          bailed: 0,
          backgrounded: 0,
          backtracksTotal: 1,
        },
        medianShipMs: null,
        steps: [
          {
            id: "company_email",
            count: 1,
            errorCount: 2,
            returnsTo: 0,
            medianMsInStep: 1_500,
          },
        ],
      },
    );

    expect(result.totals).toMatchObject({
      started: 2,
      errorEvents: 3,
      retried: 1,
      backtracks: 1,
    });
    expect(result.errors).toEqual([
      { step: "company_email", code: "freemail", count: 2 },
      { step: "phone", code: "format", count: 1 },
    ]);
    expect(result.steps[0]).toMatchObject({
      id: "company_email",
      label: "Work email",
      count: 1,
      errorCount: 2,
      medianLabel: "0:01",
    });
    expect(JSON.stringify(result)).not.toContain("session-one");
    expect(JSON.stringify(result)).not.toContain("session-two");
  });
});
