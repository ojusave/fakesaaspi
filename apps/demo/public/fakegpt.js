import { awaitRankLine, currentSessionId } from "./flow.js";
import {
  classify,
  initialState,
  reduceNonToken,
  reduceToken,
} from "./fakegpt-machine.js";

const FOOTER =
  "A parody built for a DevRelCon workshop. Nothing you type is stored or transmitted.";
const GITHUB_URL = "https://github.com/ojusave/fakesaaspi";
const DISCLAIMER = "fakegpt cannot make mistakes.";

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
  return initialState();
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
    const { state: next, bot } = reduceToken(state, result);
    state.phase = next.phase;
    setInputEnabled(false);
    const bubble = await botSay(bot.text);
    pushTranscript("bot", bot.text);
    // Append the crowd rank on its own line if it arrives in time.
    const rank = await awaitRankLine(() => lastMeta, baseline, 2500);
    if (rank) {
      const withRank = `${bot.text}\n${rank}`;
      bubble.textContent = withRank;
      state.transcript[state.transcript.length - 1].text = withRank;
      scrollToBottom();
    }
    persist();
    return;
  }

  const { state: next, bot } = reduceToken(state, result);
  state.attempt = next.attempt;
  fm()?.error("fakegpt_deploy", "invalid_grant", state.attempt);
  await botSay(bot.text);
  pushTranscript("bot", bot.text);
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
    if (classify(state, text) === "token") {
      await handleTokenAttempt(text);
    } else {
      fm()?.view("fakegpt_chat");
      const { state: next, bot } = reduceNonToken(state);
      state.phase = next.phase;
      state.nagIndex = next.nagIndex;
      await botSay(bot.text, bot.kind);
      pushTranscript("bot", bot.text, bot.kind);
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
