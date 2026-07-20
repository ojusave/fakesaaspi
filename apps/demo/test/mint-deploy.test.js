import { describe, expect, it } from "vitest";
import { createDemoApp } from "../src/app.js";
import { manifest } from "../src/manifest.js";

function setup() {
  return createDemoApp({
    adminToken: "admin-secret",
    dashboardToken: "dashboard-secret",
    writeKey: "write-secret",
    releaseUrl: "https://github.com/ojusave/fakesaaspi",
  });
}

const WK = {
  "content-type": "application/json",
  "x-firstmile-write-key": "write-secret",
};
const sid = () => `fm1.${Date.now().toString(36)}.${crypto.randomUUID()}`;
const tok = (char) => `fso_${String(char).repeat(32)}`;

function post(app, path, headers, body) {
  return app.request(path, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("mint and deploy", () => {
  it("requires the write key and validates inputs", async () => {
    const { app } = setup();
    const session = sid();
    expect(
      (await post(app, "/api/mint", { "content-type": "application/json" }, { sessionId: session, token: tok("a") })).status,
    ).toBe(401);
    expect((await post(app, "/api/mint", WK, { sessionId: "not-a-session", token: tok("a") })).status).toBe(400);
    expect((await post(app, "/api/mint", WK, { sessionId: session, token: "nope" })).status).toBe(400);
    expect((await post(app, "/api/mint", WK, { sessionId: session, token: tok("a") })).status).toBe(200);
  });

  it("verifies a minted token and is forgiving about session mismatch", async () => {
    const { app } = setup();
    const session = sid();
    const other = sid();
    const token = tok("a");
    await post(app, "/api/mint", WK, { sessionId: session, token });

    let result = await (await post(app, "/api/deploy", WK, { sessionId: session, token })).json();
    expect(result).toMatchObject({ ok: true, valid: true, sessionMismatch: false });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);

    result = await (await post(app, "/api/deploy", WK, { sessionId: other, token })).json();
    expect(result).toMatchObject({ valid: true, sessionMismatch: true });
  });

  it("revokes the previous token when a session re-mints", async () => {
    const { app } = setup();
    const session = sid();
    const first = tok("a");
    const second = tok("b");
    await post(app, "/api/mint", WK, { sessionId: session, token: first });
    await post(app, "/api/mint", WK, { sessionId: session, token: second });
    expect((await (await post(app, "/api/deploy", WK, { sessionId: session, token: first })).json()).valid).toBe(false);
    expect((await (await post(app, "/api/deploy", WK, { sessionId: session, token: second })).json()).valid).toBe(true);
  });

  it("deploy requires the write key", async () => {
    const { app } = setup();
    expect(
      (await post(app, "/api/deploy", { "content-type": "application/json" }, { sessionId: sid(), token: tok("a") })).status,
    ).toBe(401);
  });

  it("reset clears sessions, events, and tokens", async () => {
    const { app, fm } = setup();
    const session = sid();
    const token = tok("a");
    await post(app, "/api/events", WK, {
      events: [{ sessionId: session, seq: 1, ts: Date.now(), manifestVersion: manifest.version, type: "session_start" }],
    });
    await post(app, "/api/mint", WK, { sessionId: session, token });
    expect(fm.sessionCount()).toBe(1);

    await post(app, "/admin/reset?token=admin-secret", {}, {});

    expect(fm.sessionCount()).toBe(0);
    expect(fm.exportJsonl()).toBe("");
    expect((await (await post(app, "/api/deploy", WK, { sessionId: session, token })).json()).valid).toBe(false);
  });

  it("admin dashboard is 401 bare and 200 with the token", async () => {
    const { app } = setup();
    expect((await app.request("/admin/dashboard")).status).toBe(401);
    expect((await app.request("/admin/dashboard?token=admin-secret")).status).toBe(200);
    expect(
      (await app.request("/admin/dashboard", { headers: { Authorization: "Bearer admin-secret" } })).status,
    ).toBe(200);
  });
});
