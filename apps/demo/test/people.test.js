import { describe, expect, it } from "vitest";
import { buildFlow, buildPeople } from "../src/people.js";

function eventSource(events) {
  return {
    exportJsonl() {
      return events.map((event) => JSON.stringify(event)).join("\n");
    },
  };
}

describe("people dashboard", () => {
  it("counts distinct session transitions without inflating retries", () => {
    const flow = buildFlow([
      { sessionId: "one", seq: 1, ts: 1_000, type: "session_start" },
      { sessionId: "one", seq: 2, ts: 2_000, type: "page_view", step: "fakegpt_chat", nav: "forward" },
      { sessionId: "one", seq: 3, ts: 3_000, type: "page_view", step: "welcome", nav: "forward", from: "fakegpt_chat" },
      { sessionId: "one", seq: 4, ts: 4_000, type: "page_view", step: "name", nav: "forward", from: "welcome" },
      { sessionId: "one", seq: 5, ts: 5_000, type: "step_error", step: "name", code: "required", attempt: 1 },
      { sessionId: "one", seq: 6, ts: 6_000, type: "page_view", step: "company", nav: "forward", from: "name" },
      { sessionId: "one", seq: 7, ts: 7_000, type: "page_view", step: "welcome", nav: "back", from: "company" },
      { sessionId: "one", seq: 8, ts: 8_000, type: "page_view", step: "name", nav: "forward", from: "welcome" },
      { sessionId: "two", seq: 1, ts: 1_500, type: "session_start" },
      { sessionId: "two", seq: 2, ts: 2_500, type: "page_view", step: "fakegpt_chat", nav: "forward" },
      { sessionId: "two", seq: 3, ts: 3_500, type: "page_view", step: "welcome", nav: "forward", from: "fakegpt_chat" },
    ]);

    expect(flow.sampleSize).toBe(2);
    expect(flow.links).toEqual(expect.arrayContaining([
      { source: "started", target: "fakegpt", direction: "forward", distinctSessions: 2 },
      { source: "fakegpt", target: "welcome", direction: "forward", distinctSessions: 2 },
      { source: "welcome", target: "signup", direction: "forward", distinctSessions: 1 },
      { source: "signup", target: "welcome", direction: "back", distinctSessions: 1 },
    ]));
    expect(flow.links.filter((link) => link.source === "welcome" && link.target === "signup")).toHaveLength(1);
  });

  it("adds a shipped link only for an explicit shipped event", () => {
    const withoutShipment = buildFlow([
      { sessionId: "open", seq: 1, ts: 1_000, type: "session_start" },
      { sessionId: "open", seq: 2, ts: 2_000, type: "page_view", step: "fakegpt_deploy", nav: "forward" },
    ]);
    const withShipment = buildFlow([
      { sessionId: "done", seq: 1, ts: 1_000, type: "session_start" },
      { sessionId: "done", seq: 2, ts: 2_000, type: "page_view", step: "fakegpt_deploy", nav: "forward" },
      { sessionId: "done", seq: 3, ts: 3_000, type: "shipped" },
    ]);

    expect(withoutShipment.links.some((link) => link.target === "shipped")).toBe(false);
    expect(withShipment.links).toContainEqual({
      source: "deploy",
      target: "shipped",
      direction: "forward",
      distinctSessions: 1,
    });
  });

  it("keeps a direct entry link when the session bypasses an earlier route group", () => {
    const flow = buildFlow([
      { sessionId: "direct", seq: 1, ts: 1_000, type: "session_start" },
      { sessionId: "direct", seq: 2, ts: 2_000, type: "page_view", step: "welcome", nav: "forward" },
    ]);

    expect(flow.nodes.find((node) => node.id === "fakegpt")).toMatchObject({
      distinctSessions: 0,
    });
    expect(flow.links).toContainEqual({
      source: "started",
      target: "welcome",
      direction: "forward",
      distinctSessions: 1,
    });
  });

  it("reports explicit step reach instead of inferring every earlier step", () => {
    const result = buildPeople(
      eventSource([
        { sessionId: "direct", seq: 1, ts: 1_000, type: "session_start" },
        { sessionId: "direct", seq: 2, ts: 2_000, type: "page_view", step: "welcome", nav: "forward" },
      ]),
      3_000,
      {
        totals: { started: 1 },
        steps: [
          { id: "fakegpt_chat", count: 1 },
          { id: "welcome", count: 1 },
        ],
      },
    );

    expect(result.steps).toEqual([
      expect.objectContaining({ id: "fakegpt_chat", count: 0 }),
      expect.objectContaining({ id: "welcome", count: 1 }),
    ]);
  });

  it("ignores anomalous or incomplete sessions and exposes no session identifiers", () => {
    const flow = buildFlow([
      { sessionId: "private-session", seq: 1, ts: 1_000, type: "session_start" },
      { sessionId: "private-session", seq: 2, ts: 2_000, type: "page_view", step: "welcome", nav: "forward", anomaly: true },
      { sessionId: "missing-start", seq: 1, ts: 1_000, type: "page_view", step: "welcome", nav: "forward" },
      { sessionId: "missing-start", seq: 2, ts: 2_000, type: "page_view", step: "name", nav: "forward", from: "welcome" },
    ]);

    expect(flow.links).toEqual([]);
    expect(JSON.stringify(flow)).not.toContain("private-session");
  });

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
    expect(result.flow).toMatchObject({
      sampleSize: 2,
      nodes: expect.any(Array),
      links: expect.any(Array),
    });
    expect(JSON.stringify(result)).not.toContain("session-one");
    expect(JSON.stringify(result)).not.toContain("session-two");
  });
});
