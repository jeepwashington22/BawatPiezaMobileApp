# Troubleshooting

Quick fixes for the problems that actually happen in this repo.

---

## The app says "Missing Supabase env vars"

`BawatPiezaApp/src/lib/supabase.ts` throws at startup when
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are absent from
`BawatPiezaApp/.env`. Create the file, then **restart `expo start`** —
`EXPO_PUBLIC_*` values are inlined at build time, hot reload will not pick them up.

## Login says the backend is unreachable / "Request timed out"

- Is the backend running? `cd backend && npm run dev` →
  check `http://localhost:4000/health` in a browser.
- **Physical device:** `localhost` in `EXPO_PUBLIC_API_URL` points at the phone.
  Use your PC's LAN IP (`http://192.168.1.x:4000`) and same Wi-Fi.
- Windows Firewall may block inbound port 4000 — allow Node.js on private networks.
- Profile → **Device** runs the built-in diagnostic that pings `/health` and
  shows latency for Backend API, Supabase, and Redis.

## "The sign-in service is temporarily unavailable" (502)

The backend reached Supabase and got an unexpected error (bad project URL,
wrong anon key, Supabase outage). The real reason is logged server-side —
check the backend console for `[2fa] signInWithPassword failed:`.

## "This sign-in attempt has expired. Please enter your password again." (410)

The 2FA challenge lives 5 minutes in Redis. The app returns you to the password
step automatically. If this happens constantly, check the machine clock (TTL
calculation) and that the same Redis instance backs both requests (Upstash vs
local Redis mismatch).

## Verification e-mail never arrives

1. **Brevo sender not verified** — verify the address under
   Settings → Senders & IPs; `MAIL_FROM` must be that verified sender.
2. `BREVO_SMTP_USER` must be your **Brevo login e-mail**, not the sender address.
3. Check spam; check the 60 s cooldown (429 responses mean you are re-requesting
   too fast).
4. Backend console lines: `[mailer] Brevo SMTP is ready…` at startup, and
   `[2fa] … OTP email sent to …` / `[accounts] … email failed:` per send.
5. Test the transport directly: `GET /email/test` with a Bearer token.

## "Too many failed sign-in attempts" (429 on login)

Brute-force lock: 10 bad passwords within 15 minutes locks that e-mail. Wait
15 minutes or flush the Redis key `2fa:fail:<email>` (Upstash console →
data browser → delete).

## `email_registered` check always returns null

The app logs `[auth] Email check unavailable` and falls back to the combined
"no account found, or the password is incorrect" message. Migration
`006_email_registered.sql` has not been applied to the Supabase project.

## Shared Users page shows a connection hint

`pages/accounts.tsx` calls `GET /accounts` which is **admin-only**. A
`403 Admin privileges required` means the signed-in user's role metadata is
`staff`. Roles come from `user_metadata.role` on the Supabase user — set them
in the Supabase dashboard (Auth → Users → user metadata) or create the account
via the admin invite flow.

## Google Sign-In closes instantly / no redirect back

- Native uses deep link scheme `bawatpiezaapp://` (see `app.json` `scheme`).
  In a custom dev client or production build, the scheme must be registered.
- Supabase Auth → Google provider must have the redirect URLs whitelisted
  (including the Expo web origin and `bawatpiezaapp://oauth`).
- Web relies on `detectSessionInUrl` with the implicit flow — make sure the
  redirect lands on the same origin the app is served from.

## Avatars won't upload

- Migration `007_avatars_storage.sql` must be applied (public bucket + policies).
- The upload path must be `avatars/<uid>/…` — policies reject other folders.
- 5 MB / images-only limits come from the bucket settings.

## TypeScript build errors in `backend/`

Run `npm run typecheck` (`tsc --noEmit`). Common cause: editing files under
`dist/` (generated) instead of `src/`. Always edit `src/`, let `npm run dev`
rebuild.

## Health shows `redis: "degraded"`

Redis answered but `PING` did not return `PONG` — usually an Upstash REST URL
and token mismatch. On startup the backend logs
`[redis] could not connect at startup:` if it cannot reach Redis at all; OTP
features will fail in that case, everything else keeps working.
