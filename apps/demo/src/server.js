import { serve } from "@hono/node-server";
import { createDemoApp } from "./app.js";
function required(name) {
    const value = process.env[name]?.trim();
    if (!value)
        throw new Error(`${name} is required`);
    return value;
}
const releaseUrl = required("RELEASE_URL");
new URL(releaseUrl);
const port = Number(process.env.PORT ?? "10000");
if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("PORT must be an integer from 1 to 65535");
const { app } = createDemoApp({
    adminToken: required("ADMIN_TOKEN"),
    dashboardToken: required("DASHBOARD_TOKEN"),
    writeKey: required("WRITE_KEY"),
    releaseUrl,
});
serve({ fetch: app.fetch, hostname: "0.0.0.0", port }, (info) => console.log(`fakesaaspi listening on 0.0.0.0:${info.port}`));
