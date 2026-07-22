# FakeSaaSPI

A deliberately frustrating API onboarding exercise for workshops about the developer first mile.

[Start at fakegpt](https://fakesaaspi.onrender.com/fakegpt) · [Try the participant flow](https://fakesaaspi.onrender.com/) · [Open the projector](https://fakesaaspi.onrender.com/present) · [View the repository](https://github.com/ojusave/fakesaaspi)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fojusave%2Ffakesaaspi)

[Create a Render account](https://dashboard.render.com/register?utm_source=github&utm_medium=referral&utm_campaign=ojus_demos&utm_content=hero_cta) if you want to deploy an independent copy.

## Highlights

- **Phone-first workshop flow:** participants experience avoidable signup, configuration, and permission friction before reaching first success.
- **Live presenter views:** `/present` shows aggregate progress and distinct-session movement between route groups, while the token-protected admin page switches the exercise between trap and release states.
- **Scoped telemetry:** form values remain in the participant's browser. The server receives declared step IDs and lifecycle events.
- **Reproducible Render setup:** the Blueprint creates a dedicated project, production environment, free web service, generated credentials, and a health check.

## Contents

- [Use the workshop app](#use-the-workshop-app)
- [Deploy on Render](#deploy-on-render)
- [Configuration](#configuration)
- [Run locally](#run-locally)
- [Project structure](#project-structure)
- [Operations and limits](#operations-and-limits)
- [Troubleshooting](#troubleshooting)
- [Contributing and license](#contributing-and-license)

## Use the workshop app

| Route | Audience | Behavior |
| --- | --- | --- |
| `/fakegpt` | Participant | Entry point: a fake AI assistant that sends participants through the flow to get a token, then deploys it |
| `/` | Participant | Runs the fake onboarding flow |
| `/present` | Presenter or audience display | Shows public aggregate workshop progress |
| `/healthz` | Operator | Returns `{"ok":true}` when the service is ready |
| `/admin?token=<ADMIN_TOKEN>` | Presenter | Controls trap or release state, and has a RESET button; requires the admin token |
| `/admin/reset` | Presenter | `POST`, admin-token gated: clears in-memory sessions, events, and minted tokens so `/present` starts empty |

The QR code entry point for the live session is `/fakegpt`. The production app is [fakesaaspi.onrender.com](https://fakesaaspi.onrender.com/). Keep `ADMIN_TOKEN` out of slides, browser code, screenshots, and shared URLs.

The curved paths on `/present` count distinct sessions observed moving between named route groups. A session counts once per route-to-route edge, even if it retries the same transition. Solid blue paths show forward movement, and dashed amber paths show backtracking. A narrower path shows that fewer observed sessions traversed that edge by the current cutoff. It does not establish abandonment, frustration, or cause.

`/admin/reset` only wipes in-memory state. The stdout JSONL log (each accepted event is mirrored in the Render logs) is unaffected and remains the archive.

## Deploy on Render

1. Click **Deploy to Render** near the top of this README.
2. Review and approve the Blueprint in the Render Dashboard.
3. Wait for the `fakesaaspi` web service to finish its first build and pass `/healthz`.
4. Open the assigned service URL and retrieve `ADMIN_TOKEN` from the service environment when presenter controls are needed.

The root [`render.yaml`](render.yaml) creates:

- a Render project named `fakesaaspi`
- a `production` environment
- a Node 20 web service named `fakesaaspi` in Oregon
- generated `ADMIN_TOKEN`, `DASHBOARD_TOKEN`, and `WRITE_KEY` values
- a `/healthz` health check and a free instance type by default

The deployed copy is independent. In-memory workshop state starts empty and does not move between copies.

## Configuration

| Variable | Required | Visibility and purpose |
| --- | --- | --- |
| `ADMIN_TOKEN` | Yes | Server-only presenter credential for `/admin` and state changes |
| `DASHBOARD_TOKEN` | Yes | Scoped dashboard credential; expose it to a browser only for an intentionally enabled dashboard client |
| `WRITE_KEY` | Yes | Browser-visible scoped key for ingestion of declared telemetry events |
| `RELEASE_URL` | Yes | Valid absolute URL shown when the presenter releases the flow |
| `PORT` | No | HTTP port; defaults to `10000` locally and is supplied by Render in production |
| `PERSIST_PATH` | No | JSONL file path for disk-backed telemetry; when set, sessions and events survive restarts. Leave unset for in-memory only. Pair it with the commented disk block in `render.yaml`. |

The three credentials must be non-empty and distinct. The Blueprint generates safe values when creating a new copy.

Telemetry is in-memory by default, so a deploy or restart clears the funnel. To keep it across restarts, uncomment the disk block and `PERSIST_PATH` in `render.yaml`; this pins the service to a single instance with stop-then-start deploys, since a mounted disk cannot be shared or rolled. The service already runs one instance (`numInstances: 1`) because collector state lives in-process.

## Run locally

Prerequisites: Node.js 20 or later and npm.

```sh
npm ci
npm run build --workspace @firstmile/sdk
npm run build --workspace @firstmile/demo

ADMIN_TOKEN=local-admin \
DASHBOARD_TOKEN=local-dashboard \
WRITE_KEY=local-write \
RELEASE_URL=https://github.com/ojusave/fakesaaspi \
npm start --workspace @firstmile/demo
```

Open `http://localhost:10000`. For the complete demo development notes, see [`apps/demo/README.md`](apps/demo/README.md).

Run the repository checks before pushing:

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run verify
```

## Project structure

| Path | Purpose |
| --- | --- |
| `apps/demo` | FakeSaaSPI participant flow, fakegpt, projector, admin controls, and server |
| `packages/kit` | Vendored Firstmile kit: owned by [ojusave/firstmile](https://github.com/ojusave/firstmile), synced via `scripts/sync-kit.sh` |
| `examples/plain-html` | Minimal browser integration example |
| `render.yaml` | Render Blueprint for the project, environment, service, secrets, and health check |

## Operations and limits

- Workshop telemetry is stored in memory and resets on restart or deploy.
- The projector is intentionally public and exposes aggregate progress, not form values.
- The browser receives `WRITE_KEY` so it can submit scoped events. Treat it as a limited workshop credential, not as user authentication.
- `ADMIN_TOKEN` remains server-only and protects presenter controls.
- Build, deploy, and request logs are available from the `fakesaaspi` service in the Render Dashboard.

After each deploy, verify `/healthz`, `/`, and `/present`. Confirm that `/admin` without a token returns `401`.

## Troubleshooting

- **The service exits during startup:** confirm all four required variables are present and the three credentials are distinct.
- **The admin page returns `401`:** retrieve the current `ADMIN_TOKEN` from the service environment and use the exact value.
- **Workshop progress disappeared:** check for a restart or deploy. State is intentionally in memory.
- **The release button points to the wrong place:** set `RELEASE_URL` to a valid absolute URL and redeploy.

## Contributing and license

Open a focused pull request against `main`. Include the tests and live routes you exercised.

`packages/kit` is owned by [ojusave/firstmile](https://github.com/ojusave/firstmile); this repo vendors it via `scripts/sync-kit.sh` and must never be hand-edited here (a drift check in `npm run verify` enforces this). Make kit changes upstream, land them on firstmile `main`, then run the sync script.

This repository has no public license. Source is visible for review, but no reuse rights are granted until a license is selected.

License: to be decided before public release.
