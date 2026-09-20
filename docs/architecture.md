# Architecture

How the BawatPieza mobile app, backend API, and cloud services fit together.

---

## Big picture

```
┌───────────────────────────────┐
│        BawatPiezaApp          │   Expo (SDK 57) · React Native 0.86
│        (mobile / web)         │   expo-router file-based navigation
│                               │
│  src/app/**      screens      │
│  src/components/ UI kit       │
│  src/lib/        clients      │
└──────────┬───────────┬────────┘
           │           │
     HTTPS │           │ HTTPS
           │           │
┌──────────▼────────┐  ┌▼───────────────────────────┐
│   Backend API     │  │        Supabase            │
│  (Express + TS)   │  │  Auth · Postgres · Storage │
│  port 4000        │  │  (anon key from the app,   │
│                   │  │   service-role from API)   │
│ routes/           │  └────────────────────────────┘
│  /health          │
│  /accounts  ──────┼──► Supabase (user_accounts, auth admin)
│  /accounts/2fa    │
│  /email           │  ┌────────────────────────────┐
│                   ├──►│   Redis (Upstash / TCP)    │
│ middleware/       │  │  OTPs · challenges ·       │
│  requireAuth      │  │  invites · rate counters   │
│  requireAdmin     │  └────────────────────────────┘
│                   │
│ lib/mailer ───────┼──► Brevo SMTP (all transactional e-mail)
└───────────────────┘
```

---

## Responsibilities

| Concern | Mobile app | Backend API | Supabase |
| --- | --- | --- | --- |
| Sessions | Stores/refreshes tokens via `@supabase/supabase-js` | Validates Bearer tokens (`supabase.auth.getUser`) | Issues & verifies JWTs |
| Password sign-in | Collects credentials | Verifies + parks session, e-mails OTP | Password check (anon client) |
| Google Sign-In | OAuth dance via deep link `bawatpiezaapp://` | — | OAuth provider + implicit-flow tokens |
| One-time codes | Shows input, counts down | Generates, hashes (SHA-256), stores in Redis | — |
| E-mail delivery | — | Brevo SMTP via nodemailer | Edge function (`welcome-email`) |
| Profile data | Reads/writes `user_accounts` directly (RLS) | Admin reads/writes via service-role | Postgres + row level security |
| Avatars | Uploads to Storage bucket | — | `avatars` bucket + storage policies |

---

## Two Supabase clients (important!)

The backend keeps **two** clients on purpose (`backend/src/lib/`):

- **`supabase.ts` — service-role client.** Bypasses Row Level Security. Used for
  admin queries (`user_accounts`), `auth.admin.createUser`, and
  `auth.admin.updateUserById`. Must never be exposed to the app.
- **`supabaseAuth.ts` — anon client.** Behaves like a normal user. Used only for
  `signInWithPassword` during the first 2FA step, so credential checks respect
  the same rules a direct client would.

---

## Redis: the short-term memory

Redis (`backend/src/lib/redis.ts`, Upstash REST or TCP `ioredis`) holds every
short-lived secret. Nothing here is durable data — each key carries its own TTL:

| Key pattern | Purpose | TTL |
| --- | --- | --- |
| `fp:otp:<email>` / `lg:otp:<email>` | SHA-256 hash of forgot-password / login OTP | 5 min |
| `fp:att:<email>` | Wrong-attempt counter for the OTP | 5 min |
| `fp:cool:<email>` | 60 s cooldown between OTP e-mails | 60 s |
| `fp:reset:<token>` | One-time password-reset token | 10 min |
| `invite:<token>` | Set-password invite token (admin-created accounts) | 5 min |
| `2fa:challenge:<id>` | Parked Supabase session awaiting the OTP | 5 min |
| `2fa:otp:<id>` / `2fa:att:<id>` | OTP hash + attempt counter per challenge | 5 min |
| `2fa:fail:<email>` | Brute-force counter (10 bad passwords → lock) | 15 min |
| `2fa:fraud:<email>` | Consecutive-failure counter for fraud alerts | 15 min |

Only **hashes** of codes are stored — a Redis dump can never reveal an OTP.

---

## Authentication flows

### Password + 2FA login (default)

```
App                    Backend                        Supabase        Brevo
 │  POST /accounts/2fa/login                             │              │
 │  {email, password, X-Device-Info}  │                  │              │
 │───────────────────────────────────►│ signInWithPassword│             │
 │                                    │─────────────────►│              │
 │                                    │  session ✔       │              │
 │                                    │ park session in Redis (challengeId)     │
 │                                    │  send 6-digit OTP ──────────────►│ e-mail
 │  {challengeId}                     │                  │              │
 │◄───────────────────────────────────│                  │              │
 │  user types code                   │                  │              │
 │  POST /accounts/2fa/verify         │                  │              │
 │  {challengeId, otp}                │ compare SHA-256  │              │
 │───────────────────────────────────►│ delete keys      │              │
 │  {session: {access_token, ...}}    │                  │              │
 │◄───────────────────────────────────│                  │              │
 │  supabase.auth.setSession(...)  →  SIGNED_IN  →  /home │             │
```

Key idea: **no session exists in the app until the code is verified.** The
password alone is useless — the API keeps the real tokens server-side.

### Google Sign-In

`signInWithGoogle()` in `BawatPiezaApp/src/lib/supabase.ts`:

1. Web → plain `signInWithOAuth` redirect; `detectSessionInUrl` picks the
   session up from the URL.
2. Native → build the auth URL with `skipBrowserRedirect`, open it in an
   in-app browser auth session (`expo-web-browser`), catch the deep link
   `bawatpiezaapp://oauth#access_token=…`, parse the implicit-flow tokens,
   then `supabase.auth.setSession(...)`.

---

## Navigation model

- **expo-router** maps `BawatPiezaApp/src/app/**` to routes
  (`/login`, `/home`, `/pages/energy`, …).
- `src/constants/navigation.ts` is the single source of truth for the side menu
  and bottom nav; a new page is registered in one place.
- `src/app/index.tsx` is the entry gate: onboarding on first launch
  (AsyncStorage flag), login afterwards.

---

## Error & network handling

`BawatPiezaApp/src/lib/network.ts` classifies every failure into four buckets —
`offline`, `unstable`, `rateLimited`, `timeout` — each with a user-friendly
title, message, and icon, so the login/signup screens can show exactly what to
do next. `fetchWithTimeout` (15 s default) prevents hung requests. A global
`NetworkBanner` component reacts to live NetInfo state.
