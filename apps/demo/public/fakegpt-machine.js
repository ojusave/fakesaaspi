/**
 * Pure fakegpt conversation logic: no DOM, no network, no tracker. The page
 * (fakegpt.js) handles rendering, streaming, /api/deploy, and tracking; this
 * module decides what the assistant says and how state advances, so the
 * transitions are unit-testable on their own.
 */

export const OPENING =
  "Hi. I'm fakegpt. Describe what you want to build and I'll handle the rest.";

export const PLAN = `You're absolutely right. This is a great idea, and honestly, a little overdue.

Entering plan mode.

The Plan
1. Scaffold the project
2. Wire up the core logic
3. Add the integrations
4. Deploy

I've completed steps 1 through 3 in my head. For step 4 I need a fakesaaspi API token.

Get one here: [Get your token]

Paste it below when you have it. Should take about a minute. You won't need the docs: it's straightforward.`;

export const NAGS = [
  "You're absolutely right. I still need that fakesaaspi token to proceed.",
  "You're absolutely right, and I've added it to the plan. The plan still needs a fakesaaspi token.",
  "Great question. You're absolutely right to ask. Unrelated: the token.",
  "You're absolutely right that I should be able to do that for you. I cannot. The token, when you're ready.",
];

export const INVALID_FIRST =
  "You're absolutely right that this looks like a token. The API disagrees. Check the final screen on fakesaaspi and try again.";
export const INVALID_LATER =
  "You're absolutely right to try again. Still no. Are you sure you copied the right thing?";

export const SUCCESS = `Token verified. You're absolutely right, this one's real.

Deploying.

Build complete. Your app is live.

You shipped. That took you {elapsed}. Hold that thought.`;

export const TOKEN_RE = /^fso_[0-9a-f]{32}$/;

/** Fresh conversation: opening message shown, waiting for the first message. */
export function initialState() {
  return {
    phase: "fresh",
    transcript: [{ role: "bot", text: OPENING }],
    nagIndex: 0,
    attempt: 0,
  };
}

/** A token attempt is the real format or any unbroken string over 20 chars. */
export function isTokenAttempt(text) {
  const trimmed = String(text).trim();
  return TOKEN_RE.test(trimmed) || (trimmed.length > 20 && !/\s/.test(trimmed));
}

/** Formats server elapsed milliseconds as "M minutes and S seconds". */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const m = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const s = `${seconds} second${seconds === 1 ? "" : "s"}`;
  return `${m} and ${s}`;
}

/** Decides what a user message does in the current state. */
export function classify(state, text) {
  if (state.phase === "shipped") return "ignored";
  if (state.phase === "fresh") return "plan";
  return isTokenAttempt(text) ? "token" : "nag";
}

/**
 * Advances a non-token message. From "fresh" the assistant shows the plan and
 * moves to "awaiting_token"; otherwise it returns the next nag in rotation.
 * Returns { state, bot } where bot is { text, kind? }.
 */
export function reduceNonToken(state) {
  if (state.phase === "fresh") {
    return {
      state: { ...state, phase: "awaiting_token" },
      bot: { text: PLAN, kind: "plan" },
    };
  }
  const bot = { text: NAGS[state.nagIndex % NAGS.length] };
  return { state: { ...state, nagIndex: state.nagIndex + 1 }, bot };
}

/**
 * Advances a token attempt given the deploy result and an optional rank line.
 * Valid tokens ship (terminal); invalid ones return the first/later message and
 * increment the attempt counter. Returns { state, bot }.
 */
export function reduceToken(state, result, rank = "") {
  if (result && result.valid === true) {
    let text = SUCCESS.replace("{elapsed}", formatElapsed(result.elapsedMs));
    if (rank) text = `${text}\n${rank}`;
    return { state: { ...state, phase: "shipped" }, bot: { text } };
  }
  const attempt = state.attempt + 1;
  const text = attempt === 1 ? INVALID_FIRST : INVALID_LATER;
  return { state: { ...state, attempt }, bot: { text } };
}
