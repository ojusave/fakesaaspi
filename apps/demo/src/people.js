const ADJECTIVES = [
  "Sneaky",
  "Caffeinated",
  "Optimistic",
  "Chaotic",
  "Polite",
  "Reckless",
  "Sleepy",
  "Ambitious",
  "Suspicious",
  "Radiant",
  "Clumsy",
  "Fearless",
  "Dramatic",
  "Chipper",
  "Grumpy",
  "Lucky",
  "Nervous",
  "Swift",
  "Cosmic",
  "Tiny",
];

const NOUNS = [
  "Otter",
  "Bagel",
  "Penguin",
  "Waffle",
  "Noodle",
  "Pixel",
  "Mango",
  "Badger",
  "Llama",
  "Rocket",
  "Pickle",
  "Goblin",
  "Falcon",
  "Biscuit",
  "Cactus",
  "Sparrow",
  "Toaster",
  "Koala",
  "Comet",
  "Yeti",
];

/** @type {Record<string, { page: string; field: string }>} */
const STEP_INFO = {
  fakegpt_chat: { page: "fakegpt", field: "Chatting" },
  welcome: { page: "Welcome", field: "Get started" },
  name: { page: "Create account", field: "Full name" },
  company: { page: "Create account", field: "Company name" },
  company_email: { page: "Create account", field: "Work email" },
  phone: { page: "Create account", field: "Phone number" },
  consent: { page: "Create account", field: "Communications consent" },
  create_account: { page: "Creating account", field: "-" },
  app_name: { page: "Apps", field: "App name" },
  operations: { page: "Create app", field: "Operations" },
  scopes: { page: "Create app", field: "Scopes" },
  add_card: { page: "Create app", field: "Card number" },
  app_terms: { page: "Create app", field: "App terms" },
  create_app: { page: "Create app", field: "Provisioning" },
  copy_keys: { page: "Keys", field: "Copy keys" },
  paste_keys: { page: "Keys", field: "Paste keys" },
  generate_token: { page: "Keys", field: "Mint token" },
  copy_token: { page: "Keys", field: "Copy token" },
  return_to_fakegpt: { page: "Keys", field: "Back to fakegpt" },
  fakegpt_deploy: { page: "fakegpt", field: "Deploy" },
};

const namesBySession = new Map();
const takenNames = new Set();

function hash(value) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

function nameFor(sessionId) {
  const existing = namesBySession.get(sessionId);
  if (existing) return existing;
  const h = hash(sessionId);
  const base = `${ADJECTIVES[h % ADJECTIVES.length]} ${NOUNS[(h >>> 8) % NOUNS.length]}`;
  // On collision, append the smallest free numeral ("Chaotic Pickle 2").
  let name = base;
  let suffix = 2;
  while (takenNames.has(name)) {
    name = `${base} ${suffix}`;
    suffix += 1;
  }
  takenNames.add(name);
  namesBySession.set(sessionId, name);
  return name;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function infoFor(step) {
  if (!step) return { page: "Just arrived", field: "-" };
  return STEP_INFO[step] || { page: step, field: "-" };
}

/**
 * Builds the live people dashboard payload from exported JSONL events.
 */
export function buildPeople(fm, now = Date.now()) {
  const sessions = new Map();
  const jsonl = fm.exportJsonl();
  if (jsonl.length > 0) {
    for (const line of jsonl.split("\n")) {
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (!event || typeof event.sessionId !== "string") continue;
      let row = sessions.get(event.sessionId);
      if (!row) {
        row = {
          sessionId: event.sessionId,
          step: null,
          startedAt: event.ts,
          stepEnteredAt: event.ts,
          lastSeen: event.ts,
          shipped: false,
          shippedAt: null,
          closed: false,
          closedAt: null,
        };
        sessions.set(event.sessionId, row);
      }
      row.lastSeen = event.ts;
      if (event.type === "session_start" && event.resumed !== true) {
        row.startedAt = event.ts;
      }
      if (event.type === "session_start") {
        row.closed = false;
        row.closedAt = null;
      }
      if (event.type === "page_view" && typeof event.step === "string") {
        row.step = event.step;
        row.stepEnteredAt = event.ts;
      }
      if (event.type === "shipped") {
        row.shipped = true;
        row.shippedAt ??= event.ts;
      }
      if (event.type === "bye") {
        row.closed = true;
        row.closedAt = event.ts;
      }
    }
  }

  const people = [...sessions.values()]
    .map((row) => {
      // Shipping is driven by the shipped event, which fakegpt fires on deploy.
      const shipped = row.shipped;
      const step = row.step;
      const info = infoFor(step);
      const page = shipped ? "Shipped" : info.page;
      const field = shipped ? "Done" : info.field;
      const stoppedAt = row.shippedAt ?? (row.closed ? row.closedAt : null) ?? now;
      const totalMs = Math.max(0, stoppedAt - (row.startedAt || stoppedAt));
      const stepMs = Math.max(0, stoppedAt - (row.stepEnteredAt || row.startedAt || stoppedAt));
      let status = "active";
      if (shipped) status = "shipped";
      else if (row.closed) status = "closed";
      else if (now - row.lastSeen > 45_000) status = "idle";
      return {
        id: row.sessionId,
        name: nameFor(row.sessionId),
        step: step || "started",
        page,
        field,
        where: shipped ? "Shipped" : field === "-" ? page : `${page} · ${field}`,
        totalMs,
        stepMs,
        totalLabel: formatDuration(totalMs),
        stepLabel: formatDuration(stepMs),
        status,
      };
    })
    .sort((a, b) => {
      // Keep shipped visible at the top so the count change is obvious.
      if (a.status === "shipped" && b.status !== "shipped") return -1;
      if (b.status === "shipped" && a.status !== "shipped") return 1;
      return b.totalMs - a.totalMs;
    });

  return {
    generatedAt: now,
    count: people.length,
    people,
  };
}
