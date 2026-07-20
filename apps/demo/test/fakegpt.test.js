import { describe, expect, it } from "vitest";
import {
  INVALID_FIRST,
  INVALID_LATER,
  NAGS,
  OPENING,
  PLAN,
  classify,
  formatElapsed,
  initialState,
  isTokenAttempt,
  reduceNonToken,
  reduceToken,
} from "../public/fakegpt-machine.js";

describe("fakegpt state machine", () => {
  it("starts fresh with the opening message", () => {
    const state = initialState();
    expect(state.phase).toBe("fresh");
    expect(state.transcript).toEqual([{ role: "bot", text: OPENING }]);
  });

  it("shows the plan on the first message regardless of content", () => {
    const state = initialState();
    expect(classify(state, "build me a todo app")).toBe("plan");
    const { state: next, bot } = reduceNonToken(state);
    expect(next.phase).toBe("awaiting_token");
    expect(bot).toEqual({ text: PLAN, kind: "plan" });
  });

  it("cycles the nag rotation in order and wraps", () => {
    let state = { ...initialState(), phase: "awaiting_token" };
    const seen = [];
    for (let i = 0; i < NAGS.length + 1; i += 1) {
      expect(classify(state, "when will it be done")).toBe("nag");
      const result = reduceNonToken(state);
      seen.push(result.bot.text);
      state = result.state;
    }
    expect(seen.slice(0, NAGS.length)).toEqual(NAGS);
    expect(seen[NAGS.length]).toBe(NAGS[0]);
  });

  it("detects token attempts", () => {
    expect(isTokenAttempt(`fso_${"a".repeat(32)}`)).toBe(true);
    expect(isTokenAttempt("x".repeat(21))).toBe(true);
    expect(isTokenAttempt("hello there")).toBe(false);
    expect(isTokenAttempt("short")).toBe(false);
    expect(isTokenAttempt(`has spaces ${"y".repeat(30)}`)).toBe(false);
  });

  it("returns invalid-first then invalid-later, incrementing attempt", () => {
    let state = { ...initialState(), phase: "awaiting_token" };
    let result = reduceToken(state, { valid: false });
    expect(result.bot.text).toBe(INVALID_FIRST);
    expect(result.state.attempt).toBe(1);
    result = reduceToken(result.state, { valid: false });
    expect(result.bot.text).toBe(INVALID_LATER);
    expect(result.state.attempt).toBe(2);
  });

  it("ships on a valid token with elapsed and optional rank line", () => {
    const state = { ...initialState(), phase: "awaiting_token" };
    const result = reduceToken(state, { valid: true, elapsedMs: 65_000 }, "#3 of 40.");
    expect(result.state.phase).toBe("shipped");
    expect(result.bot.text.startsWith("Token verified")).toBe(true);
    expect(result.bot.text).toContain("1 minute and 5 seconds");
    expect(result.bot.text.endsWith("\n#3 of 40.")).toBe(true);
  });

  it("ships without a rank line when none arrives", () => {
    const state = { ...initialState(), phase: "awaiting_token" };
    const result = reduceToken(state, { valid: true, elapsedMs: 5_000 });
    expect(result.bot.text.endsWith("Hold that thought.")).toBe(true);
  });

  it("formats elapsed with pluralization", () => {
    expect(formatElapsed(0)).toBe("0 minutes and 0 seconds");
    expect(formatElapsed(61_000)).toBe("1 minute and 1 second");
    expect(formatElapsed(125_000)).toBe("2 minutes and 5 seconds");
  });

  it("ignores messages once shipped", () => {
    expect(classify({ ...initialState(), phase: "shipped" }, "hello")).toBe("ignored");
  });
});
