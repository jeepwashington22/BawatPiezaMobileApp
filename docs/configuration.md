# Configuration

Every environment variable used by the project, where it lives, and what breaks
when it is missing.

---

## Backend — `backend/.env`

Copy `backend/.env.example` as the starting point.

### Server

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port the API listens on |
| `NODE_ENV` | `development` | `production` switches morgan to combined logs |
| `CORS_ORIGIN` | `*` | comma-separated allowed origins |
| `FRONTEND_URL` | `http://localhost:3000` | used in e-mail links (sign-in / set-password buttons) |

### Supabase (Project Settings → API)

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key — **server only**, bypasses RLS; used for admin account operations |
| `SUPABASE_ANON_KEY` | anon key — used by the second client (`supabaseAuth.ts`) for password verification during 2FA |

### Two-factor login

| Variable | Default | Purpose |
| --- | --- | --- |
| `LOGIN_2FA_ENABLED` | `true` | when `true`, `POST /accounts/2fa/login` returns a `challengeId` and e-mails a code. When `false`, the session is returned directly (password-only). **Never disable in production.** |

### Redis

| Variable | Purpose |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Upstash REST API (recommended) |
| `REDIS_URL` | standard TCP URL, e.g. `redis://localhost:6379` (used when the REST vars are absent) |

Stores OTP hashes, 2FA challenges, invite tokens, brute-force and fraud counters.

### Health check

| Variable | Default | Purpose |
| --- | --- | --- |
| `HEALTH_LIVENESS_ONLY` | `false` | `true` skips the Supabase/Redis checks in `GET /health` for lightweight liveness probes |

### Brevo SMTP (e-mail delivery)

| Variable | Purpose |
| --- | --- |
| `BREVO_SMTP_HOST` | `smtp-relay.brevo.com` |
| `BREVO_SMTP_PORT` | `587` |
| `BREVO_SMTP_SECURE` | `false` (STARTTLS) |
| `BREVO_SMTP_USER` | **your Brevo login e-mail** (not the sender address) |
| `BREVO_SMTP_KEY` | SMTP key starting with `xsmtpsib-` |
| `MAIL_FROM` | a sender address verified in Brevo → Senders & IPs |
| `MAIL_FROM_NAME` | display name, e.g. `BawatPieza` |

---

## Mobile app — `BawatPiezaApp/.env`

Create this file next to `app.json`. Only variables prefixed `EXPO_PUBLIC_`
reach the app bundle.

| Variable | Required | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL — the app throws at startup without it |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (safe to expose; RLS protects data) |
| `EXPO_PUBLIC_API_URL` | recommended | Backend base URL for devices (LAN IP, or a public HTTPS URL) |
| `EXPO_PUBLIC_API_PORT` | optional | Backend port used when the app derives the host itself. Defaults to `4000` |

### How the app finds the API

`BawatPiezaApp/src/lib/api.ts` resolves the base URL **at runtime**, in this order:

1. `EXPO_PUBLIC_API_URL`, when its host is not `localhost` / `127.0.0.1`.
2. The host the bundle was served from — the browser origin on web, the Metro
   dev-server host on native (`expo start --lan` → the PC's LAN IP) — with port
   `4000`. This is why a stale LAN IP in `.env` no longer breaks the app.
3. `10.0.2.2:4000` on an Android emulator, otherwise `localhost:4000`.

Each request also retries the remaining candidates, and a failure message names
every URL that was tried. `resolveApiBase()`, `apiUrl()` and `apiFetch()` are the
only API entry points screens should use.

> **Physical device tip:** set `EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:4000` as a
> fallback, keep the phone on the same Wi-Fi, and allow inbound TCP 4000 once with
> `npm run allow-lan-api` (elevated PowerShell). Restart `expo start` after any
> `.env` change: values are inlined at build time.

### Cleartext HTTP on Android / iOS

Plain `http://` is blocked by default on Android 9+ and by iOS App Transport
Security. `app.json` configures both, and the settings are **native** — they only
apply after a new prebuild/build, not on a JS reload:

- `expo-build-properties` → `android.usesCleartextTraffic: true`
  (`android.usesCleartextTraffic` at the `expo.android` level is **not** a
  supported app-config key and is silently ignored).
- `ios.infoPlist.NSAppTransportSecurity` → `NSAllowsArbitraryLoads` +
  `NSAllowsLocalNetworking`, so a LAN address such as `http://192.168.1.9:4000`
  is allowed on iOS.

For anything beyond local development, serve the API over HTTPS and drop
`NSAllowsArbitraryLoads` — an App Store review may ask why it is set.

---

## Where each value is consumed

| Value | Read by |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` | `BawatPiezaApp/src/lib/supabase.ts` (single client) |
| `EXPO_PUBLIC_API_URL` | `src/lib/api.ts` (resolver) → `login.tsx`, `forgot-password.tsx`, `pages/accounts.tsx`, `pages/device.tsx`, `lib/supabase.ts` (welcome e-mail) |
| `SUPABASE_SERVICE_ROLE_KEY` | `backend/src/lib/supabase.ts` (all admin routes) |
| `SUPABASE_ANON_KEY` | `backend/src/lib/supabaseAuth.ts` (2FA step 1 password check) |
| Redis vars | `backend/src/lib/redis.ts` (OTP/challenge storage) |
| Brevo vars | `backend/src/lib/mailer.ts` (all transactional e-mail) |

---

## Security notes

- The **service-role key must never** appear in `BawatPiezaApp/.env`, be
  committed to git, or be sent to a client. The anon key is public by design —
  Postgres RLS and the `user_accounts` policies are the real gate.
- `LOGIN_2FA_ENABLED=false` reduces sign-in to a single factor; use it only on
  a machine with no reachable mailbox (local tests).
- Brevo e-mails originate from a verified sender; unverified senders are the
  most common cause of "e-mail never arrives" issues.
