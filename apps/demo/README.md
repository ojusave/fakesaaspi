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

Open `http://localhost:10000`. The live entry point is `/fakegpt` (the QR code target), the projector is at `/present`, and the admin page is at `/admin?token=admin-secret`.

The projector's curved route view is calculated after ingestion. It counts distinct sessions for each movement between route groups, so repeated traversal by one session does not inflate a path. Forward movement and backtracking remain separate. The visualization can show where observed activity changed, but not why a participant stopped.

## fakegpt

`/fakegpt` is a fake AI assistant and the entry point of the experience. It sends participants to the onboarding flow to mint a token, then verifies that token via `POST /api/deploy` and marks the session shipped. It shares the tracker session with the flow (same origin and localStorage), so the whole loop is one funnel built from existing manifest steps.

`packages/kit` is owned by [ojusave/firstmile](https://github.com/ojusave/firstmile) and vendored here via `scripts/sync-kit.sh`. Do not hand-edit it; a drift check in `npm run verify` enforces this.

## Admin reset

The admin page has a RESET button (`POST /admin/reset`, admin-token gated) that clears the in-memory sessions, events, and minted tokens so `/present` starts empty between runs. This only wipes in-memory state: the stdout JSONL log (each accepted event is written to stdout, mirrored in the Render logs) is unaffected and remains the archive of the session.
