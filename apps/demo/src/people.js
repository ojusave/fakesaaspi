import { manifest as defaultManifest } from "./manifest.js";

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

const GROUP_LABELS = {
  fakegpt: "FakeGPT",
  welcome: "Welcome",
  signup: "Create account",
  create_app: "Create app",
  keys: "Keys",
  deploy: "Deploy",
};

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

function publicStep(step) {
  const info = infoFor(step.id);
  return {
    id: step.id,
    page: info.page,
    field: info.field,
    label: info.field === "-" ? info.page : info.field,
    count: step.count ?? 0,
    errorCount: step.errorCount ?? 0,
    returnsTo: step.returnsTo ?? 0,
    medianMsInStep: step.medianMsInStep ?? null,
    medianLabel:
      typeof step.medianMsInStep === "number"
        ? formatDuration(step.medianMsInStep)
        : null,
  };
}

function addSession(map, key, sessionId) {
  const sessions = map.get(key) ?? new Set();
  sessions.add(sessionId);
  map.set(key, sessions);
}

/**
 * Aggregates privacy-safe route movement. Each edge counts a session at most
 * once, so retries and repeated visits cannot make the curve look wider.
 */
export function buildFlow(events, routeManifest = defaultManifest) {
  const groupOrder = new Map(
    routeManifest.groups.map((group, index) => [group, index]),
  );
  const groupByStep = new Map(
    routeManifest.steps.map((step) => [step.id, step.group]),
  );
  const eventsBySession = new Map();

  events.forEach((event, inputIndex) => {
    if (
      !event ||
      event.anomaly === true ||
      typeof event.sessionId !== "string"
    ) {
      return;
    }
    const sessionEvents = eventsBySession.get(event.sessionId) ?? [];
    sessionEvents.push({ event, inputIndex });
    eventsBySession.set(event.sessionId, sessionEvents);
  });

  const nodeSessions = new Map([
    ["started", new Set()],
    ...routeManifest.groups.map((group) => [group, new Set()]),
    ["shipped", new Set()],
  ]);
  const linkSessions = new Map();
  const linkDetails = new Map();

  for (const [sessionId, unordered] of eventsBySession) {
    const ordered = [...unordered].sort((left, right) => {
      const leftSeq = Number.isSafeInteger(left.event.seq)
        ? left.event.seq
        : Number.MAX_SAFE_INTEGER;
      const rightSeq = Number.isSafeInteger(right.event.seq)
        ? right.event.seq
        : Number.MAX_SAFE_INTEGER;
      return (
        leftSeq - rightSeq ||
        Number(left.event.ts ?? 0) - Number(right.event.ts ?? 0) ||
        left.inputIndex - right.inputIndex
      );
    });

    if (
      !ordered.some(
        ({ event }) =>
          event.type === "session_start" && event.resumed !== true,
      )
    ) {
      continue;
    }

    let started = false;
    let currentGroup = null;

    for (const { event } of ordered) {
      if (event.type === "session_start" && event.resumed !== true) {
        started = true;
        nodeSessions.get("started").add(sessionId);
        continue;
      }

      if (event.type === "page_view" && typeof event.step === "string") {
        const nextGroup = groupByStep.get(event.step);
        if (nextGroup === undefined) continue;
        nodeSessions.get(nextGroup).add(sessionId);

        let source = currentGroup;
        if (source === null && started) source = "started";
        if (source !== null && source !== nextGroup) {
          const sourceOrder = source === "started" ? -1 : groupOrder.get(source);
          const targetOrder = groupOrder.get(nextGroup);
          const direction =
            event.nav === "back" ||
            (sourceOrder !== undefined &&
              targetOrder !== undefined &&
              targetOrder < sourceOrder)
              ? "back"
              : "forward";
          const key = `${source}\u0000${nextGroup}\u0000${direction}`;
          addSession(linkSessions, key, sessionId);
          linkDetails.set(key, { source, target: nextGroup, direction });
        }
        currentGroup = nextGroup;
        continue;
      }

      if (event.type === "shipped" && currentGroup !== null) {
        nodeSessions.get("shipped").add(sessionId);
        const key = `${currentGroup}\u0000shipped\u0000forward`;
        addSession(linkSessions, key, sessionId);
        linkDetails.set(key, {
          source: currentGroup,
          target: "shipped",
          direction: "forward",
        });
      }
    }
  }

  const nodeOrder = ["started", ...routeManifest.groups, "shipped"];
  const orderByNode = new Map(nodeOrder.map((id, index) => [id, index]));
  const nodes = nodeOrder.map((id) => ({
    id,
    label:
      id === "started"
        ? "Started"
        : id === "shipped"
          ? "Shipped"
          : GROUP_LABELS[id] ?? id,
    order: orderByNode.get(id),
    distinctSessions: nodeSessions.get(id)?.size ?? 0,
  }));
  const links = [...linkDetails.entries()]
    .map(([key, detail]) => ({
      ...detail,
      distinctSessions: linkSessions.get(key)?.size ?? 0,
    }))
    .sort(
      (left, right) =>
        (orderByNode.get(left.source) ?? 0) -
          (orderByNode.get(right.source) ?? 0) ||
        (orderByNode.get(left.target) ?? 0) -
          (orderByNode.get(right.target) ?? 0) ||
        left.direction.localeCompare(right.direction),
    );

  return {
    sampleSize: nodeSessions.get("started").size,
    nodes,
    links,
    method:
      "Widths count distinct sessions per group-to-group transition. Repeated traversal of the same edge by one session counts once.",
  };
}

/**
 * Builds the live people dashboard payload from exported JSONL events.
 */
export function buildPeople(fm, now = Date.now(), dashboard = null) {
  const sessions = new Map();
  const events = [];
  const errorCounts = new Map();
  const retriedSessions = new Set();
  let errorEvents = 0;
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
      events.push(event);
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
      if (event.type === "step_error") {
        errorEvents += 1;
        const step = typeof event.step === "string" ? event.step : "unknown";
        const code = typeof event.code === "string" ? event.code : "unknown";
        const key = `${step}\u0000${code}`;
        errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
        if (typeof event.attempt === "number" && event.attempt > 1) {
          retriedSessions.add(event.sessionId);
        }
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
    totals: {
      started: dashboard?.totals?.started ?? people.length,
      activeNow:
        dashboard?.totals?.activeNow ??
        people.filter((person) => person.status === "active").length,
      shipped:
        dashboard?.totals?.shipped ??
        people.filter((person) => person.status === "shipped").length,
      closed: dashboard?.totals?.closed ?? 0,
      bailed: dashboard?.totals?.bailed ?? 0,
      backgrounded: dashboard?.totals?.backgrounded ?? 0,
      backtracks: dashboard?.totals?.backtracksTotal ?? 0,
      errorEvents,
      retried: retriedSessions.size,
    },
    medianShipMs: dashboard?.medianShipMs ?? null,
    medianShipLabel:
      typeof dashboard?.medianShipMs === "number"
        ? formatDuration(dashboard.medianShipMs)
        : null,
    steps: Array.isArray(dashboard?.steps)
      ? dashboard.steps.map(publicStep)
      : [],
    errors: [...errorCounts.entries()]
      .map(([key, count]) => {
        const [step, code] = key.split("\u0000");
        return { step, code, count };
      })
      .sort((left, right) =>
        right.count - left.count ||
        left.step.localeCompare(right.step) ||
        left.code.localeCompare(right.code),
      ),
    flow: buildFlow(events),
    people,
  };
}
