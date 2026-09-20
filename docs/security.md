# Security Model

How BawatPieza protects accounts — two-factor login, one-time codes, brute-force
limits, and fraud alerts.

---

## Two-factor authentication (email OTP)

Every password sign-in goes through the backend (`POST /accounts/2fa/login`).
The design principle: **a correct password alone is worth nothing.**

1. The backend verifies credentials with Supabase **using the anon client**
   (`supabaseAuth.ts`), never the service-role client — the latter bypasses RLS
   and would sign anyone in.
2. The Supabase session that a correct password produces is **parked in Redis**
   under a random 24-byte `challengeId`. The API response carries only that id.
3. A 6-digit code is generated with `crypto.randomInt` and e-mailed via Brevo.
4. Only `POST /accounts/2fa/verify` with the correct code releases the parked
   session, after which the app calls `supabase.auth.setSession(...)`.

Consequences:

- The app's `SIGNED_IN` listener cannot short-circuit the second factor —
  there is no session to listen for until verify succeeds.
- `LOGIN_2FA_ENABLED=false` (env) bypasses the flow for local tests only.

## One-time codes (OTPs)

| Property | Value | Why |
| --- | --- | --- |
| Generation | `crypto.randomInt(0, 1_000_000)`, zero-padded 6 digits | uniform, unguessable |
| Storage | **SHA-256 hash only** in Redis | a database leak reveals nothing |
| TTL | 5 minutes | limits replay window |
| Attempts | max 5 wrong tries, then the code is burned | blocks brute-force of the 6-digit space |
| Resend cooldown | 60 s per address | protects the inbox and the Brevo quota |
| Single use | deleted immediately on success | cannot be replayed |
| Scope separation | `fp:` (forgot password) vs `2fa:` (login) namespaces | a login code can never reset a password and vice versa |

The API responds generically on the forgot-password endpoint
(*"If that email is registered, a verification code has been sent"*) so it never
reveals whether an address exists. For the login endpoint, the app pairs the
ambiguous error with the `email_registered` RPC to produce a helpful hint —
an intentional, documented trade-off (see migration `006`).

## Brute-force lockout

Failed password attempts are counted per email in Redis (`2fa:fail:<email>`,
15-minute rolling window). At **10 failures** the API answers
`429 Too many failed sign-in attempts. Please wait 15 minutes…` before even
touching Supabase. A successful sign-in clears the counter.

## Fraud alerts ("someone may be trying to open your account")

After **5 consecutive** bad-password attempts for one account, the owner
receives a security e-mail containing:

- device info (from the app's `X-Device-Info` header),
- source IP (from `X-Forwarded-For` — `trust proxy` is enabled on the server),
- approximate location (free ip-api.com lookup; private/loopback IPs are
  skipped), and
- the count and time of the attempts (Asia/Manila timezone).

Rate limiting: one alert per **15 minutes** maximum (`2fa:fraud:sent:<email>`).
The alert is strictly best-effort — it can never change the sign-in response.

## Password reset chain

```
email → OTP (5 min, ≤5 tries) → one-time resetToken (10 min) → new password
```

The reset token is single-use and deleted the moment it is consumed. Completing
a reset also confirms the e-mail and activates the account, so a *pending*
user who proves mailbox ownership can recover too.

## Token & session handling

- Sessions persist via AsyncStorage (native) / localStorage (web, SSR-guarded)
  with `autoRefreshToken: true`.
- Every protected backend route requires `Authorization: Bearer <access_token>`;
  the token is verified with `supabase.auth.getUser(token)` on **each request**
  (no token caching, no local trust).
- Role checks: `requireAuth` attaches `{id, email, role}` from the verified
  user's metadata; `requireAdmin` then rejects non-admins with `403`.

## Database & storage

- Row Level Security is enabled on `user_accounts`; regular users can only
  touch their own row, admin listing happens through the service-role key.
- The `avatars` Storage bucket allows writes **only into the user's own
  folder** (`avatars/<uid>/…`) via storage policies (migration `007`).
- The backend never logs passwords, OTPs, or tokens; `morgan` logs contain
  URLs only.

## Known trade-offs (documented, deliberate)

- `email_registered` RPC enables account enumeration in exchange for a better
  sign-in hint. Pair with rate limiting at the edge if you expose it widely.
- IP geolocation uses a key-less free service (ip-api.com) with a 4 s timeout —
  best-effort only, and it is skipped for private addresses.
