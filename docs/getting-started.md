# Getting Started

Everything needed to run BawatPieza locally: the backend API first, then the
mobile app.

---

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20+ | required by both `backend/` and `BawatPiezaApp/` |
| npm | 10+ | ships with Node |
| Expo Go | latest | on a physical phone, **or** an Android emulator / iOS simulator |
| Supabase project | — | free tier is fine (Auth + Postgres + Storage) |
| Upstash Redis | — | free tier is fine (or any Redis for `REDIS_URL`) |
| Brevo account | — | free tier sends the transactional e-mails |

---

## 1. Backend API (`backend/`)

```bash
cd backend
npm install
cp .env.example .env      # then fill in the values (see configuration.md)
npm run dev               # builds TS → dist/ and watches; API on http://localhost:4000
```

`.env` checklist (full reference in [configuration.md](configuration.md)):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
  → Supabase Dashboard → Project Settings → API
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (or `REDIS_URL`)
- Brevo SMTP: `BREVO_SMTP_USER` (your Brevo login e-mail), `BREVO_SMTP_KEY`
  (starts with `xsmtpsib-`), `MAIL_FROM` (a **verified sender**)
- `LOGIN_2FA_ENABLED=true` (leave it on — disable only for local tests)

Verify it is alive:

```bash
curl http://localhost:4000/health
# {"status":"ok","uptime":…,"supabase":"ok","redis":"ok","timestamp":…}
```

## 2. Database (Supabase)

Run each SQL file in `backend/supabase/migrations/` in order, from
**Supabase Dashboard → SQL Editor**:

| File | What it does |
| --- | --- |
| `001_user_accounts.sql` | `user_accounts` table + sync trigger |
| `002_profile_rls.sql` | users can read/update their own row |
| `003_fix_rls_recursion.sql` | RLS recursion fix |
| `004_welcome_email_trigger.sql` | welcome e-mail trigger |
| `005_fix_new_user_signup.sql` | signup fix |
| `006_email_registered.sql` | `email_registered(check_email)` RPC |
| `007_avatars_storage.sql` | `avatars` bucket policies |

Also deploy the edge function if you want server-side welcome e-mails:

```bash
supabase functions deploy welcome-email
```

## 3. Mobile app (`BawatPiezaApp/`)

```bash
cd BawatPiezaApp
npm install
# create .env next to app.json:
#   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
#   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ…
#   EXPO_PUBLIC_API_URL=http://<YOUR-LAN-IP>:4000
npm start                 # expo dev server
```

Then press `a` (Android emulator), `i` (iOS simulator), or scan the QR code
with Expo Go.

> **Physical device?** `localhost` inside the app refers to the phone itself, so
> the app resolves the API address at runtime (`src/lib/api.ts`): it uses
> `EXPO_PUBLIC_API_URL` when that points at a real host, otherwise the LAN IP
> Metro served the bundle from. Keep the phone and PC on the same Wi-Fi and allow
> inbound TCP 4000 once — `npm run allow-lan-api` in an **elevated** PowerShell:

```bash
npm run allow-lan-api           # firewall rule for port 4000 (admin, once per PC)
npm run allow-lan-api:check     # show the rule, the port and the LAN URLs to test
```

> Still "Cannot reach BawatPieza server" on the phone? Open
> `http://<PC-LAN-IP>:4000/health` **in the phone's browser** — JSON means the
> network path is fine, nothing (no HTML) means the firewall or the Wi-Fi is
> blocking it. See [troubleshooting.md](troubleshooting.md).

### Running in Expo Go (no Android Studio required)

`npm run android` is `expo start --android`, which reaches the device through
`adb`. On a PC without the Android SDK it stops immediately with:

```text
Failed to resolve the Android SDK path. Default install location not found: C:\Users\<you>\AppData\Local\Android\Sdk. Use ANDROID_HOME to set the Android SDK location.
Error: 'adb' is not recognized as an internal or external command, operable program or batch file.
```

Nothing is wrong with the project — **Expo Go is installed on the phone, not on
the PC**, so no Android SDK is involved:

1. Install **Expo Go** from the Play Store (Android) or the App Store (iOS).
2. Keep phone and PC on the same Wi-Fi and allow inbound TCP 4000 once:
   `npm run allow-lan-api` (elevated). The app finds the PC's LAN address by
   itself (`src/lib/api.ts`), so `.env` no longer has to be re-edited when the
   router hands out a new IP.
3. `npm run expo-go` (preflight + dev server) or `npm start`, then scan the QR
   code — Android: Expo Go → *Scan QR code*; iOS: the Camera app.
4. Same Wi-Fi but the QR never connects (guest Wi-Fi, AP isolation, VPN)?
   `npm run expo-go:tunnel` serves the bundle through ngrok instead — note that
   Metro is tunnelled, **not** the API.

`npm run expo-go:check` runs the preflight only (`.env`, LAN IP, API URL, port
8081, `/health` reachability, firewall rule, Android tooling) and exits without
starting Metro.

The scripted flow lives in `BawatPiezaApp/scripts/start-expo-go.ps1`
(`-Tunnel`, `-Clear`, `-Check`, `-Port <n>`).

### Optional: an Android emulator on the PC

Only needed for `npm run android` / pressing `a`. Install **Android Studio** and
create a virtual device from Device Manager — it installs the SDK, sets
`ANDROID_HOME` and adds `adb` to your PATH. See Expo's guide:
<https://docs.expo.dev/workflow/android-studio-emulator/>. With the emulator
running, `npm run android` also installs Expo Go into it automatically.

## 4. Smoke test the whole chain

1. App opens → onboarding → login screen.
2. Sign up with an e-mail you control → confirmation e-mail arrives.
3. Sign in → a 6-digit code arrives → enter it → you land on **Home**.
4. Profile → **Device** → all three services (Backend API, Supabase, Redis)
   show green with latency.

---

## Project scripts

| Location | Command | What it does |
| --- | --- | --- |
| `backend/` | `npm run dev` | build + watch + restart |
| `backend/` | `npm run build` | compile TypeScript to `dist/` |
| `backend/` | `npm run start` | run compiled `dist/index.js` |
| `backend/` | `npm run typecheck` | `tsc --noEmit` |
| `BawatPiezaApp/` | `npm start` | expo dev server (scan the QR with Expo Go) |
| `BawatPiezaApp/` | `npm run expo-go` | preflight checks + expo dev server for Expo Go |
| `BawatPiezaApp/` | `npm run expo-go:check` | preflight checks only, no server |
| `BawatPiezaApp/` | `npm run expo-go:tunnel` | expo dev server over an ngrok tunnel |
| `BawatPiezaApp/` | `npm run allow-lan-api` | add the inbound firewall rule for TCP 4000 (admin, once) |
| `BawatPiezaApp/` | `npm run allow-lan-api:check` | report the rule, port 4000 and the LAN URLs (no changes) |
| `BawatPiezaApp/` | `npm run start:tunnel` / `start:clear` | raw `expo start` variants |
| `BawatPiezaApp/` | `npm run android` / `ios` / `web` | platform targets (`android` needs adb + SDK) |
| `BawatPiezaApp/` | `npm run lint` | expo lint |
