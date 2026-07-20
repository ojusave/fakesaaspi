import { awaitRankLine, currentSessionId } from "./flow.js";

const FOOTER =
  "A parody built for a DevRelCon workshop. Nothing you type is stored or transmitted.";
const GITHUB_URL = "https://github.com/ojusave/fakesaaspi";
const DISCLAIMER = "fakegpt cannot make mistakes.";

const OPENING =
  "Hi. I'm fakegpt. Describe what you want to build and I'll handle the rest.";

const PLAN = `You're absolutely right. This is a great idea, and honestly, a little overdue.

Entering plan mode.

The Plan
1. Scaffold the project
2. Wire up the core logic
3. Add the integrations
4. Deploy

I've completed steps 1 through 3 in my head. For step 4 I need a fakesaaspi API token.

Get one here: [Get your token]

Paste it below when you have it. Should take about a minute.`;

const NAGS = [
  "You're absolutely right. I still need that fakesaaspi token to proceed.",
  "You're absolutely right, and I've added it to the plan. The plan still needs a fakesaaspi token.",
  "Great question. You're absolutely right to ask. Unrelated: the token.",
  "You're absolutely right that I should be able to do that for you. I cannot. The token, when you're ready.",
];

const INVALID_FIRST =
  "You're absolutely right that this looks like a token. The API disagrees. Check the final screen on fakesaaspi and try again.";
const INVALID_LATER =
  "You're absolutely right to try again. Still no. Are you sure you copied the right thing?";

const SUCCESS = `Token verified. You're absolutely right, this one's real.

Deploying.

Build complete. Your app is live.

You shipped. That took you {elapsed}. Hold that thought.`;

const TOKEN_RE = /^fso_[0-9a-f]{32}$/;
const fm = () => window.firstmile;

let writeKey = "";
let releaseUrl = GITHUB_URL;
let sessionId = null;
let lastMeta = null;
let released = false;
let busy = false;

/** { phase, transcript: [{role,text,kind?}], nagIndex, attempt } */
let state = null;

function stateKey() {
  return `fakegpt:v1:${sessionId ?? "anon"}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(stateKey());
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to a fresh conversation
  }
  return {
    phase: "fresh",
    transcript: [{ role: "bot", text: OPENING }],
    nagIndex: 0,
    attempt: 0,
  };
}

function persist() {
  try {
    localStorage.setItem(stateKey(), JSON.stringify(state));
  } catch {
    // Persistence is best-effort; the live conversation still works.
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function planHtml(text) {
  return escapeHtml(text).replace(
    "[Get your token]",
    '<a href="/">Get your token</a>',
  );
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const m = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const s = `${seconds} second${seconds === 1 ? "" : "s"}`;
  return `${m} and ${s}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messagesEl() {
  return document.getElementById("messages");
}

function scrollToBottom() {
  const el = messagesEl();
  if (el) el.scrollTop = el.scrollHeight;
}

function addBubble(role, text, kind) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  if (kind === "plan") el.innerHTML = planHtml(text);
  else el.textContent = text;
  messagesEl().append(el);
  scrollToBottom();
  return el;
}

function pushTranscript(role, text, kind) {
  state.transcript.push(kind ? { role, text, kind } : { role, text });
  persist();
}

/** Streams a bot message with a brief think delay, total under ~4s. */
async function botSay(text, kind) {
  const typing = addBubble("bot typing", "\u2022\u2022\u2022");
  await sleep(500);
  typing.remove();
  const bubble = addBubble("bot", "");
  const chars = [...text];
  const step = chars.length > 0 ? Math.min(24, Math.floor(1800 / chars.length)) : 0;
  let shown = "";
  for (let i = 0; i < chars.length; i += 1) {
    shown += chars[i];
    bubble.textContent = shown;
    if (i % 3 === 0) {
      scrollToBottom();
      await sleep(step);
    }
  }
  if (kind === "plan") bubble.innerHTML = planHtml(text);
  scrollToBottom();
  return bubble;
}

function isTokenAttempt(text) {
  const t = text.trim();
  return TOKEN_RE.test(t) || (t.length > 20 && !/\s/.test(t));
}

async function verifyToken(token) {
  try {
    const response = await fetch("/api/deploy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-firstmile-write-key": writeKey,
      },
      body: JSON.stringify({ sessionId: currentSessionId(), token }),
    });
    if (!response.ok) return { valid: false, elapsedMs: 0 };
    return await response.json();
  } catch {
    return { valid: false, elapsedMs: 0 };
  }
}

function setInputEnabled(enabled) {
  const input = document.getElementById("input");
  const send = document.getElementById("send");
  if (input) input.disabled = !enabled;
  if (send) send.disabled = !enabled;
}

async function handleTokenAttempt(token) {
  const result = await verifyToken(token);
  const valid = result.valid === true;
  fm()?.paste("fakegpt_deploy", valid);

  if (valid) {
    fm()?.complete("fakegpt_deploy");
    const baseline =
      lastMeta && typeof lastMeta.shipped === "number" ? lastMeta.shipped : null;
    fm()?.shipped();
    state.phase = "shipped";
    setInputEnabled(false);
    const text = SUCCESS.replace("{elapsed}", formatElapsed(result.elapsedMs));
    const bubble = await botSay(text);
    pushTranscript("bot", text);
    // Append the crowd rank on its own line if it arrives in time.
    const rank = await awaitRankLine(() => lastMeta, baseline, 2500);
    if (rank) {
      const withRank = `${text}\n${rank}`;
      bubble.textContent = withRank;
      state.transcript[state.transcript.length - 1].text = withRank;
      scrollToBottom();
    }
    persist();
    return;
  }

  state.attempt += 1;
  fm()?.error("fakegpt_deploy", "invalid_grant", state.attempt);
  const text = state.attempt === 1 ? INVALID_FIRST : INVALID_LATER;
  await botSay(text);
  pushTranscript("bot", text);
  persist();
}

async function handleMessage(raw) {
  const text = raw.trim();
  if (text === "" || busy || state.phase === "shipped") return;
  busy = true;
  setInputEnabled(false);

  addBubble("user", text);
  pushTranscript("user", text);

  try {
    if (state.phase === "fresh") {
      fm()?.view("fakegpt_chat");
      state.phase = "awaiting_token";
      await botSay(PLAN, "plan");
      pushTranscript("bot", PLAN, "plan");
      persist();
    } else if (isTokenAttempt(text)) {
      await handleTokenAttempt(text);
    } else {
      fm()?.view("fakegpt_chat");
      const nag = NAGS[state.nagIndex % NAGS.length];
      state.nagIndex += 1;
      await botSay(nag);
      pushTranscript("bot", nag);
      persist();
    }
  } finally {
    busy = false;
    if (state.phase !== "shipped") {
      setInputEnabled(true);
      document.getElementById("input")?.focus();
    }
  }
}

function renderTranscript() {
  const el = messagesEl();
  el.replaceChildren();
  for (const entry of state.transcript) {
    addBubble(entry.role, entry.text, entry.kind);
  }
  scrollToBottom();
}

function renderChat() {
  released = false;
  const root = document.getElementById("root");
  root.innerHTML = `
    <header><span class="dot"></span>fakegpt</header>
    <div id="messages"></div>
    <form id="composer" autocomplete="off">
      <input id="input" name="message" type="text" placeholder="Message fakegpt" autocomplete="off" />
      <button id="send" type="submit">Send</button>
    </form>
    <footer>${DISCLAIMER}</footer>
  `;
  renderTranscript();
  const form = document.getElementById("composer");
  const input = document.getElementById("input");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value;
    input.value = "";
    void handleMessage(value);
  });
  if (state.phase === "shipped") setInputEnabled(false);
}

function renderReleased() {
  released = true;
  const root = document.getElementById("root");
  root.innerHTML = `
    <div class="release">
      <h1>The opposite of everything you just experienced.</h1>
      <a class="button" href="${escapeHtml(releaseUrl)}">Get the workshop materials</a>
      <p class="sub">One tap. No signup. No card. That is the whole point.</p>
      <div class="release-footer">
        <p>${FOOTER}</p>
        <p><a href="${GITHUB_URL}">GitHub repository</a></p>
      </div>
    </div>
  `;
}

async function boot() {
  const configResponse = await fetch("/api/config", { cache: "no-store" });
  if (configResponse.ok) {
    const config = await configResponse.json();
    if (typeof config.releaseUrl === "string") releaseUrl = config.releaseUrl;
    if (typeof config.writeKey === "string") writeKey = config.writeKey;
  }

  const manifestResponse = await fetch("/api/manifest", { cache: "no-store" });
  const manifest = await manifestResponse.json();

  await fm()?.init({
    endpoint: "",
    manifest,
    app: "fakesaaspi",
    writeKey,
  });

  sessionId = currentSessionId();
  state = loadState();

  fm()?.view("fakegpt_chat");
  fm()?.onMeta((meta) => {
    lastMeta = meta;
    if (meta && meta.portalState === "release" && !released) {
      renderReleased();
    } else if (meta && meta.portalState === "trap" && released) {
      renderChat();
    }
  });

  renderChat();
}

boot();
