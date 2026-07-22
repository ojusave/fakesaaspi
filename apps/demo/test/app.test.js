import { describe, expect, it } from "vitest";
import { createDemoApp } from "../src/app.js";

function setup() {
  return createDemoApp({
    adminToken: "admin-secret",
    dashboardToken: "dashboard-secret",
    writeKey: "write-secret",
    releaseUrl: "https://github.com/ojusave/fakesaaspi",
  });
}

describe("FakeSaaSPI server", () => {
  it("serves the phone flow, projector, and health check", async () => {
    const { app } = setup();
    const root = await app.request("/");
    expect(root.status).toBe(200);
    expect(await root.text()).toContain("<title>fakesaaspi</title>");
    const projector = await app.request("/present");
    expect(projector.status).toBe(200);
    const projectorHtml = await projector.text();
    expect(projectorHtml).toContain("Observed route movement");
    expect(projectorHtml).toContain('id="flow-svg"');
    expect(projectorHtml).toContain('data-skipped-stages');
    expect(projectorHtml).toContain("Distinct sessions observed on each route transition");
    expect((await app.request("/healthz")).status).toBe(200);
  });

  it("protects the admin page and exposes anonymous people data", async () => {
    const { app } = setup();
    expect((await app.request("/admin")).status).toBe(401);
    expect((await app.request("/admin?token=admin-secret")).status).toBe(200);
    const response = await app.request("/api/people");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      count: 0,
      totals: { started: 0, errorEvents: 0, retried: 0 },
      steps: expect.any(Array),
      errors: [],
      people: [],
    });
  });

  it("exposes transition aggregates and clears them on workshop reset", async () => {
    const { app } = setup();
    const baseTs = Date.now();
    const event = (seq, values) => ({
      sessionId: "fm1.mrtcoo09.2c8322f3-39bd-49d4-a40b-deaf498fbc77",
      seq,
      ts: baseTs + seq,
      manifestVersion: "2026-07-20a",
      ...values,
    });
    const ingest = await app.request("/api/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-firstmile-write-key": "write-secret",
      },
      body: JSON.stringify({
        events: [
          event(1, { type: "session_start" }),
          event(2, { type: "page_view", step: "fakegpt_chat", nav: "forward" }),
          event(3, { type: "page_view", step: "welcome", nav: "forward", from: "fakegpt_chat" }),
        ],
      }),
    });
    expect(ingest.status).toBe(200);
    expect(await ingest.json()).toMatchObject({ accepted: 3, rejected: 0 });

    const before = await (await app.request("/api/people")).json();
    expect(before.flow.links).toContainEqual({
      source: "fakegpt",
      target: "welcome",
      direction: "forward",
      distinctSessions: 1,
    });

    expect((await app.request("/admin/reset?token=admin-secret", { method: "POST" })).status).toBe(200);
    const after = await (await app.request("/api/people")).json();
    expect(after.flow.sampleSize).toBe(0);
    expect(after.flow.links).toEqual([]);
  });
});
