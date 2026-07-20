# FakeSaaSPI

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fojusave%2Ffakesaaspi)

FakeSaaSPI is an intentionally frustrating fake API onboarding flow for a DevRelCon workshop. Participants use the phone experience while the presenter watches anonymous progress in a live projector view.

The repository includes the Firstmile SDK that powers position-only workshop telemetry. Participant form values stay in the browser. Only declared step IDs and lifecycle events reach the server.

## Deploy on Render

1. Click **Deploy to Render** above.
2. Approve the Blueprint.
3. Render creates a new project named `fakesaaspi` with a `production` environment.
4. Wait for the `fakesaaspi` web service health check to pass.

The Blueprint generates distinct values for `ADMIN_TOKEN`, `DASHBOARD_TOKEN`, and `WRITE_KEY`. It configures the release URL automatically.

## Workshop URLs

- Participant flow: `/`
- Projector view: `/present`
- Health check: `/healthz`
- Admin controls: `/admin?token=<ADMIN_TOKEN>`

Retrieve `ADMIN_TOKEN` from the service environment in the Render Dashboard. Keep it private.

## Local verification

```sh
npm ci
npm run build --workspace @firstmile/sdk
npm run build --workspace @firstmile/demo
npm test --workspace @firstmile/demo
```

See [`apps/demo/README.md`](apps/demo/README.md) for the local start command.

## Repository layout

- `apps/demo`: FakeSaaSPI server, phone flow, projector, and admin controls
- `packages/kit`: Firstmile browser SDK and Hono collector
- `render.yaml`: Blueprint that creates the dedicated Render project and service

## Current limits

- Telemetry is held in memory and resets on restart or deploy.
- The projector view exposes anonymous aggregate progress without authentication.
- This private workshop repository has no selected public license.

License: to be decided before public release.
