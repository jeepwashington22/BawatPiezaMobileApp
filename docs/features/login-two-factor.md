# Login with Two-Factor Authentication

- **Route:** `/login`
- **Source:** `BawatPiezaApp/src/app/login.tsx`
- **API:** `POST /accounts/2fa/login` → `POST /accounts/2fa/verify` →
  `POST /accounts/2fa/resend` (all backend)
- **Status:** 🟢 live — the flagship security flow

---

## Flow (two screens, one challenge)

**Step 1 — credentials.** Email + password are validated locally
(`validateEmail`, `validateLoginPassword` — login never lectures about password
*strength*, only presence). If the device is offline the request is skipped and
a clear offline message shows.

The app then calls `POST /accounts/2fa/login` with an `X-Device-Info` header
(device model/OS, used by the fraud-alert e-mail). The backend verifies the
password with Supabase, **parks the session in Redis**, and returns only a
`challengeId`. A 6-digit code arrives by e-mail (5 min validity).

**Step 2 — OTP.** The user types the code; the app calls
`POST /accounts/2fa/verify { challengeId, otp }`. On success the parked session
`{ access_token, refresh_token }` comes back, and the app finishes with
`supabase.auth.setSession(...)` → `SIGNED_IN` → navigation to `/home`.

**Resend.** `POST /accounts/2fa/resend { challengeId }` issues a fresh code,
gated by a 60-second on-screen countdown that mirrors the server cooldown. The
parked session is untouched, so a slow e-mail never forces a password retype.

## Error handling details

| Situation | Behaviour |
| --- | --- |
| `401` from the API | The app asks Supabase `email_registered` RPC to refine the generic message into "No account found for this email…" or "Incorrect password…". Falls back to the combined wording when the RPC is unavailable. |
| `410` on verify/resend | Challenge expired → app returns to the password step with a clear message. |
| `429` | Rate-limit bucket with hourglass icon; "wait a few minutes" copy. |
| `LOGIN_2FA_ENABLED=false` on the server | The response carries the session directly; the app detects it and skips the OTP screen. |
| Transport errors | Classified into offline/unstable/timeout buckets with icons, plus an `Alert`. |

## Security notes (why it is built this way)

- No session exists in the app until the code is verified — the password alone
  can never produce one (see [security.md](../security.md)).
- Codes are stored as SHA-256 hashes, single-use, max 5 wrong attempts,
  10 bad passwords / 15 min brute-force lock, fraud-alert e-mail at 5
  consecutive failures with device + IP + approximate location.

## Files involved (backend)

`backend/src/routes/twoFactor.ts` (flow), `backend/src/lib/redis.ts` (challenge
storage), `backend/src/lib/mailer.ts` (Brevo), `backend/src/middleware/*`
(errors). Full request/response reference:
[two-factor.md](../api/two-factor.md).
