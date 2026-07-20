import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { createFirstmile } from "@firstmile/sdk/server";
import { Hono } from "hono";
import { renderAdminPage } from "./admin-page.js";
import { manifest } from "./manifest.js";
import { buildPeople } from "./people.js";
const publicRoot = fileURLToPath(new URL("../public", import.meta.url));
const trackerScript = readFileSync(fileURLToPath(new URL("../../../packages/kit/dist/tracker.min.js", import.meta.url)), "utf8");
const presentHtml = () => readFileSync(join(publicRoot, "present.html"), "utf8");
function authorized(value, token, expected) {
    return token === expected || value === `Bearer ${expected}`;
}
// The client-side OAuth token: `fso_` + 32 hex. Sessions look like
// `fm1.<base36 ts>.<uuid>`; the base36 chunk is the minting session's start.
const TOKEN_RE = /^fso_[0-9a-f]{32}$/;
const SESSION_RE = /^fm1\.[0-9a-z]+\.[0-9a-f-]+$/i;
const MAX_TOKENS = 2000;
function startedAtFromSessionId(sessionId) {
    const match = /^fm1\.([0-9a-z]+)\./i.exec(sessionId);
    if (!match)
        return null;
    const startedAt = Number.parseInt(match[1], 36);
    return Number.isSafeInteger(startedAt) && startedAt >= 0 ? startedAt : null;
}
function counts(fm) {
    let shipped = 0;
    for (const line of fm.exportJsonl().split("\n")) {
        try {
            if (JSON.parse(line).type === "shipped")
                shipped += 1;
        }
        catch { /* malformed lines do not affect totals */ }
    }
    return { started: fm.sessionCount(), shipped };
}
export function createDemoApp(config) {
    let portalState = "trap";
    const ref = { current: null };
    // counts() re-parses the full JSONL export, so cache it for one second:
    // a burst of ingests within the same second reuses the same value.
    let countsCache = null;
    let countsCacheAt = 0;
    function cachedCounts() {
        const now = Date.now();
        if (countsCache !== null && now - countsCacheAt < 1000)
            return countsCache;
        countsCache = counts(ref.current);
        countsCacheAt = now;
        return countsCache;
    }
    const fm = createFirstmile({
        manifest: manifest,
        adminToken: config.adminToken,
        dashboardToken: config.dashboardToken,
        writeKey: config.writeKey,
        limits: { maxRequestsPerWindow: 6000, maxSessions: 400 },
        meta: () => ({ portalState, ...cachedCounts() }),
    });
    ref.current = fm;
    // Server-side token registry. The flow mints here after generating a token;
    // fakegpt verifies here on deploy. In-memory only, capped, and cleared by
    // /admin/reset. `tokens` is insertion-ordered so the oldest evicts first.
    const tokens = new Map(); // token -> minting sessionId
    const latestBySession = new Map(); // sessionId -> its current token
    function mintToken(sessionId, token) {
        // Re-minting revokes the session's previous token for real: the old
        // clipboard value stops verifying.
        const prev = latestBySession.get(sessionId);
        if (prev !== undefined)
            tokens.delete(prev);
        tokens.delete(token);
        tokens.set(token, sessionId);
        latestBySession.set(sessionId, token);
        while (tokens.size > MAX_TOKENS) {
            const oldest = tokens.keys().next().value;
            const oldestSession = tokens.get(oldest);
            tokens.delete(oldest);
            if (latestBySession.get(oldestSession) === oldest)
                latestBySession.delete(oldestSession);
        }
    }
    function clearTokens() {
        tokens.clear();
        latestBySession.clear();
    }
    const app = new Hono();
    app.use("*", async (context, next) => { await next(); context.header("Cache-Control", "no-store"); });
    app.get("/api/manifest", (context) => context.json(manifest));
    app.get("/api/config", (context) => context.json({
        releaseUrl: config.releaseUrl,
        writeKey: config.writeKey,
    }));
    app.get("/api/people", (context) => context.json(buildPeople(fm)));
    app.post("/api/mint", async (context) => {
        if (context.req.header("X-Firstmile-Write-Key") !== config.writeKey)
            return context.json({ ok: false, error: "unauthorized" }, 401);
        let body;
        try {
            body = await context.req.json();
        }
        catch {
            return context.json({ ok: false, error: "invalid JSON body" }, 400);
        }
        const sessionId = body?.sessionId;
        const token = body?.token;
        if (typeof sessionId !== "string" || !SESSION_RE.test(sessionId))
            return context.json({ ok: false, error: "invalid sessionId" }, 400);
        if (typeof token !== "string" || !TOKEN_RE.test(token))
            return context.json({ ok: false, error: "invalid token" }, 400);
        mintToken(sessionId, token);
        return context.json({ ok: true });
    });
    app.post("/api/deploy", async (context) => {
        if (context.req.header("X-Firstmile-Write-Key") !== config.writeKey)
            return context.json({ ok: false, error: "unauthorized" }, 401);
        let body;
        try {
            body = await context.req.json();
        }
        catch {
            return context.json({ ok: false, error: "invalid JSON body" }, 400);
        }
        const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
        const token = typeof body?.token === "string" ? body.token : "";
        const mintingSession = tokens.get(token);
        const valid = mintingSession !== undefined;
        let elapsedMs = 0;
        let sessionMismatch = false;
        if (valid) {
            const startedAt = startedAtFromSessionId(mintingSession);
            elapsedMs = startedAt === null ? 0 : Math.max(0, Date.now() - startedAt);
            // A token from another phone still deploys: be forgiving, this is live.
            sessionMismatch = mintingSession !== sessionId;
        }
        return context.json({ ok: true, valid, elapsedMs, sessionMismatch });
    });
    app.get("/tracker.min.js", (context) => context.body(trackerScript, 200, { "Content-Type": "text/javascript; charset=UTF-8" }));
    // People-card projector (overrides kit funnel /present)
    app.get("/present", (context) => context.html(presentHtml()));
    app.get("/present/", (context) => context.html(presentHtml()));
    app.get("/admin", (context) => {
        const token = context.req.query("token");
        if (!authorized(context.req.header("Authorization"), token, config.adminToken))
            return context.json({ ok: false, error: "unauthorized" }, 401);
        return context.html(renderAdminPage(fm.snapshot(), token ?? config.adminToken));
    });
    app.get("/admin/dashboard", (context) => {
        const token = context.req.query("token");
        if (!authorized(context.req.header("Authorization"), token, config.adminToken))
            return context.json({ ok: false, error: "unauthorized" }, 401);
        return context.json(fm.snapshot());
    });
    app.post("/admin/reset", (context) => {
        if (!authorized(context.req.header("Authorization"), context.req.query("token"), config.adminToken))
            return context.json({ ok: false, error: "unauthorized" }, 401);
        fm.reset();
        clearTokens();
        return context.json(fm.snapshot());
    });
    app.post("/admin/state", async (context) => {
        if (!authorized(context.req.header("Authorization"), context.req.query("token"), config.adminToken))
            return context.json({ ok: false, error: "unauthorized" }, 401);
        let body;
        try {
            body = await context.req.json();
        }
        catch {
            return context.json({ ok: false, error: "invalid JSON body" }, 400);
        }
        if (typeof body !== "object" || body === null || !("portalState" in body) || (body.portalState !== "trap" && body.portalState !== "release"))
            return context.json({ ok: false, error: 'portalState must be "trap" or "release"' }, 400);
        portalState = body.portalState;
        return context.json(fm.snapshot());
    });
    app.route("/", fm.routes);
    app.get("/", (c) => c.html(readFileSync(join(publicRoot, "index.html"), "utf8")));
    app.get("/app.js", (c) => c.body(readFileSync(join(publicRoot, "app.js"), "utf8"), 200, { "Content-Type": "text/javascript" }));
    app.get("/flow.js", (c) => c.body(readFileSync(join(publicRoot, "flow.js"), "utf8"), 200, { "Content-Type": "text/javascript" }));
    app.get("/favicon.svg", (c) => c.body(readFileSync(join(publicRoot, "favicon.svg"), "utf8"), 200, { "Content-Type": "image/svg+xml" }));
    app.use("/*", serveStatic({ root: publicRoot, index: "index.html" }));
    return { app, fm, releaseUrl: config.releaseUrl };
}
