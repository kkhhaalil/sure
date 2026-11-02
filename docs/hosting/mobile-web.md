# Mobile web app (`/m`)

Sure ships an installable mobile web app at `https://<your-server>/m`. It is a
Progressive Web App (PWA): people open it once in Safari or Chrome, add it to
the Home Screen, and from then on it opens full screen like a native app, with
offline reading and Web Push notifications. It talks only to `/api/v1`, using
its own OAuth token, so everything it shows comes from the same API other
clients use.

It is a self-hosting-friendly alternative to the Flutter [mobile app](../../mobile/README.md):
there is nothing to sideload or sign, and it works on any phone that can reach
the server.

## What it covers

| Screen | Purpose |
| --- | --- |
| Home | Budget left and pace, transactions to review, budget rings, upcoming bills, this month's cash flow |
| Review | One transaction at a time with suggested categories; swipe to approve or skip |
| Transactions | Search, filters (this month, uncategorized, by account), detail sheet, category picker, "always categorize this way", manual entry |
| Spending | This month vs. normal, 12-month bars, category detail with budget editing and rollover |
| Accounts | Net worth over time, accounts by type, account sheet with balance history and "sync now", holdings |
| Recurring | Bills left to pay this month, this week and later |
| Assistant | Chat with Sure's AI assistant, seeded with proactive insights |
| Settings | Connections health, notifications, export, sign out |

Provider setup, re-authentication and administration stay in the full web app;
the mobile app links there.

## Building

The app's source is in [`mobile_web/`](../../mobile_web) (React, Vite and
TypeScript, with TanStack Router for routes and TanStack Query for API
data). Sheets are search parameters on the current route (`?txn=<id>`,
`?account=<id>`), so the system back gesture closes them. Its build output,
`public/m-app/`, is not committed.

- **Docker images** build it automatically in the `mobile_web` stage of the
  [`Dockerfile`](../../Dockerfile); the final image needs no Node runtime.
- **Running from source**, build it before starting Rails, and again after
  pulling changes to `mobile_web/`:

  ```sh
  npm --prefix mobile_web ci
  npm --prefix mobile_web run build
  ```

  While working on the app itself, `npm --prefix mobile_web run dev` rebuilds on
  every change; reload `/m` to pick it up.

If `/m` shows a blank page, the build output is missing.

## Signing in

The app has its own sign-in screen:

- **Password** (with a TOTP code when MFA is on) goes straight to
  `POST /api/v1/auth/login`.
- **Passkey** uses the web passkey endpoints, then exchanges the resulting web
  session for an API token at `POST /m/session_token`. Configure
  `WEBAUTHN_RP_ID` and `WEBAUTHN_ALLOWED_ORIGINS` as described in
  [WebAuthn configuration](webauthn.md).
- **Single sign-on** sends people through the normal web sign-in page; when they
  open `/m` again the app picks up that session the same way.

Tokens are issued per device (`MobileDevice` with `device_type: web`), last 30
days, and refresh automatically. Signing out of the app revokes its token and
clears its offline cache.

## Web Push notifications

Web Push works on self-hosted servers; unlike [APNs push](push-notifications.md)
it needs no Apple credentials. Generate a VAPID key pair once and keep it stable
(changing it invalidates every existing subscription):

```sh
bin/rails runner 'k = WebPush.generate_key; puts "WEB_PUSH_VAPID_PUBLIC_KEY=#{k.public_key}", "WEB_PUSH_VAPID_PRIVATE_KEY=#{k.private_key}"'
```

Set these for both the web and Sidekiq processes:

| Variable | Purpose |
| --- | --- |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | Sent to browsers when they subscribe |
| `WEB_PUSH_VAPID_PRIVATE_KEY` | Signs pushes; keep it server-side |
| `WEB_PUSH_VAPID_SUBJECT` | Contact for push services, e.g. `mailto:admin@example.com` |

Without these keys the Notifications toggle in the app's Settings is refused
(`403`). On iPhone and iPad, Web Push is only available once the app has been
added to the Home Screen (iOS 16.4 or later).

## Requirements

- HTTPS in production. Service workers, Web Push and passkeys all require a
  secure origin (`http://localhost` is allowed for development).
- Sidekiq running, as for the web app: rule runs, syncs and push delivery are
  background jobs.

## API additions used by the app

The app relies on these `/api/v1` endpoints; any API client can use them:

- `GET /transactions` filters `reviewed`, `uncategorized`, `exclude_transfers` and
  `excluded`; `PATCH /transactions/:id` accepts `reviewed` and `excluded`;
  `POST /transactions/review` marks many reviewed;
  `GET /transactions/:id/category_suggestions`.
- `PATCH /budgets/:id`, `GET /budgets/:id/pace`, `PATCH /budget_categories/:id`,
  and `GET /budget_categories?budget_id=…&include_amounts=true`.
- `POST /rules`, `PATCH /rules/:id`, `DELETE /rules/:id`, `POST /rules/:id/apply`,
  `POST /rules/from_transaction`.
- `GET /balance_sheet/series` and `GET /cash_flow/series`.
- `POST /accounts/:id/sync`, `PATCH /insights/:id`, message `status` in
  `GET /chats/:id`, and `logo_url` on merchants.
- `POST /auth/logout` revokes the calling OAuth token.
- `POST /push_subscriptions` with `platform: "web"` and
  `GET /push_subscriptions/vapid_public_key`.

`mobile_web/e2e/api_smoke.sh` exercises them against a server loaded with demo
data (`bin/rails demo_data:default`).
