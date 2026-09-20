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

> **Physical device?** `localhost` inside the app refers to the phone itself.
> Set `EXPO_PUBLIC_API_URL` to your PC's LAN IP (e.g. `http://192.168.1.20:4000`)
> and make sure the phone and PC share the same Wi-Fi network.

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
| `BawatPiezaApp/` | `npm start` | expo dev server |
| `BawatPiezaApp/` | `npm run android` / `ios` / `web` | platform targets |
| `BawatPiezaApp/` | `npm run lint` | expo lint |
