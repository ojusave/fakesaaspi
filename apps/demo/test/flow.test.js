import { describe, expect, it } from "vitest";
import { luhnValid, validateField } from "../public/flow.js";

describe("FakeSaaSPI validation", () => {
  it("rejects freemail twice before accepting it", () => {
    expect(validateField("company_email", "a@gmail.com", 1).code).toBe("freemail");
    expect(validateField("company_email", "a@gmail.com", 2).code).toBe("freemail");
    expect(validateField("company_email", "a@gmail.com", 3)).toEqual({ ok: true });
  });

  it("uses the intentionally inverted card rule", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(validateField("add_card", "4111111111111111", 1).code).toBe("card_declined");
    expect(validateField("add_card", "4111111111111111", 4)).toEqual({ ok: true });
  });
});
