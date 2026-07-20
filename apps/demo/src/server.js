import { serve } from "@hono/node-server";
import { createDemoApp } from "./app.js";
function required(name) {
    const value = process.env[name]?.trim();
    if (!value)
        throw new Error(`${name} is required`);
    return value;
}
function optional(name) {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}
const releaseUrl = required("RELEASE_URL");
new URL(releaseUrl);
const port = Number(process.env.PORT ?? "10000");
if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("PORT must be an integer from 1 to 65535");
const { app, fm } = createDemoApp({
    adminToken: required("ADMIN_TOKEN"),
    dashboardToken: required("DASHBOARD_TOKEN"),
    writeKey: required("WRITE_KEY"),
    releaseUrl,
    persistPath: optional("PERSIST_PATH"),
});
const server = serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, (info) => console.log(`fakesaaspi listening on 0.0.0.0:${info.port}`));
// Render sends SIGTERM on every deploy and restart. Flush the persistence append
// handle and stop accepting connections before the process exits.
let closing = false;
function shutdown(signal) {
    if (closing)
        return;
    closing = true;
    console.log(`fakesaaspi received ${signal}, shutting down`);
    fm.close();
    server.close(() => process.exit(0));
    // Fail-safe: exit even if connections refuse to drain in time.
    setTimeout(() => process.exit(0), 5_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
