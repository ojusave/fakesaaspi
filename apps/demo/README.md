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
