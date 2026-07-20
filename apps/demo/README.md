# FakeSaaSPI

FakeSaaSPI is the phone-first workshop experience for the Firstmile DevRelCon exercise. Participants move through an intentionally frustrating fake API onboarding flow while the presenter watches anonymous progress at `/present` and controls the trap or release state at `/admin?token=...`.

Typed participant values stay in the browser. The server receives only declared step IDs and lifecycle events.

## Local run

```sh
npm ci
npm run build --workspace @firstmile/sdk
npm run build --workspace @firstmile/demo
ADMIN_TOKEN=admin-secret \
DASHBOARD_TOKEN=dashboard-secret \
WRITE_KEY=write-secret \
RELEASE_URL=https://github.com/ojusave/fakesaaspi \
npm start --workspace @firstmile/demo
```

Open `http://localhost:10000`. The projector is at `/present`. The admin page is at `/admin?token=admin-secret`.

## Admin reset

The admin page has a RESET button (`POST /admin/reset`, admin-token gated) that clears the in-memory sessions and events so `/present` starts empty between runs. This only wipes in-memory state: the stdout JSONL log (each accepted event is written to stdout, mirrored in the Render logs) is unaffected and remains the archive of the session.
