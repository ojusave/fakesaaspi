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
    expect((await app.request("/present")).status).toBe(200);
    expect((await app.request("/healthz")).status).toBe(200);
  });

  it("protects the admin page and exposes anonymous people data", async () => {
    const { app } = setup();
    expect((await app.request("/admin")).status).toBe(401);
    expect((await app.request("/admin?token=admin-secret")).status).toBe(200);
    const response = await app.request("/api/people");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ count: 0, people: [] });
  });
});
