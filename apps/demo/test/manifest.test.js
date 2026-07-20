import { describe, expect, it } from "vitest";
import { manifest } from "../src/manifest.js";

describe("manifest surgery", () => {
  it("bumps the version and uses the fakegpt funnel groups", () => {
    expect(manifest.version).toBe("2026-07-20a");
    expect(manifest.groups).toEqual([
      "fakegpt",
      "welcome",
      "signup",
      "create_app",
      "keys",
      "deploy",
    ]);
  });

  it("adds the fakegpt steps and drops the old api_call steps", () => {
    const ids = manifest.steps.map((step) => step.id);
    expect(ids[0]).toBe("fakegpt_chat");
    expect(ids).toContain("return_to_fakegpt");
    expect(ids).toContain("fakegpt_deploy");
    for (const gone of ["paste_token", "send_request", "response"]) {
      expect(ids).not.toContain(gone);
    }
  });

  it("moves copy_token into keys and shapes fakegpt_deploy", () => {
    const byId = Object.fromEntries(manifest.steps.map((step) => [step.id, step]));
    expect(byId.copy_token.group).toBe("keys");
    expect(byId.fakegpt_deploy).toMatchObject({
      group: "deploy",
      type: "paste",
      expects: "oauth_token",
    });
  });
});
