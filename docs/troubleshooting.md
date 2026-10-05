# Troubleshooting

Quick fixes for the problems that actually happen in this repo.

---

## The app says "Missing Supabase env vars"

`BawatPiezaApp/src/lib/supabase.ts` throws at startup when
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are absent from
`BawatPiezaApp/.env`. Create the file, then **restart `expo start`** —
`EXPO_PUBLIC_*` values are inlined at build time, hot reload will not pick them up.

## Login says "Cannot reach BawatPieza server" / "Request timed out"

The message now ends with **`Tried http://<host>:4000/...`**, so the first thing
to read is the address the app actually used.

1. **Is the backend running?** `cd backend && npm run dev`, then check
   `http://localhost:4000/health` in a browser on the PC.
2. **Works in a browser, fails in the app — or fails only on the phone?**
   Traffic from the PC to itself never passes the firewall, so the browser can
   succeed while the phone is blocked. Allow the port once, from an
   **elevated** PowerShell:

   ```bash
   cd BawatPiezaApp
   npm run allow-lan-api            # adds the "BawatPieza API (TCP 4000)" rule
   npm run allow-lan-api:check      # report only: rule, port 4000, LAN URLs
   ```

   Then open `http://<PC-LAN-IP>:4000/health` **in the phone's browser**. JSON
   back means the phone can reach the API and the app will work too.
3. **The app finds the address itself.** `src/lib/api.ts` auto-detects the LAN
   IP Metro served the bundle from (expo-constants `hostUri`, `--lan` → the
   PC's current IP) and only falls back to `EXPO_PUBLIC_API_URL`, so a stale IP
   in `.env` is no longer fatal. If you *did* set a wrong host there, fix `.env`
   and **restart Metro** (`EXPO_PUBLIC_*` values are inlined at start).
4. **The phone must be on the same Wi-Fi.** Guest Wi-Fi, AP isolation and a VPN
   on the phone all block device-to-PC traffic. `npm run expo-go:tunnel` tunnels
   **only** Metro — the phone still has to reach the API, so either share the
   network or host the API over HTTPS and point `EXPO_PUBLIC_API_URL` at it.
5. **Native builds (APK / EAS / dev client), not Expo Go.** Android 9+ and iOS
   block plain `http://` by default. `app.json` handles this: the
   `expo-build-properties` plugin sets `android.usesCleartextTraffic` and
   `ios.infoPlist.NSAppTransportSecurity` allows local HTTP. Those are **native**
   settings — they need a fresh build (`npx expo prebuild --clean` / `eas build`),
   reloading JS is not enough. Expo Go already allows local HTTP.
6. Profile → **Device** runs the built-in diagnostic (`/health`) and prints the
   resolved address plus latency for Backend API, Supabase, and Redis.

## `npm run android` fails: "Failed to resolve the Android SDK path" / `'adb' is not recognized`

`expo start --android` launches a device through `adb`, so it needs the Android
SDK. Expo Go does not: the Expo Go app runs on the phone and downloads the bundle
from Metro over Wi-Fi. Pick one:

- **Expo Go (installs nothing on the PC):** `npm run expo-go` or `npm start`,
  then scan the QR code.
- **Android SDK:** install Android Studio → SDK Manager / Device Manager, then
  persist the path with `setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"` and open
  a **new** shell — already-open terminals keep the old environment.

`npm run expo-go:check` reports which of the two is active, plus `.env`, LAN IP
and port checks.

## Expo Go can't connect to the dev server

- Phone and PC on the same Wi-Fi, and the network must allow device-to-device
  traffic — guest Wi-Fi, AP isolation and VPNs all block it.
- Windows Firewall must allow Node.js inbound on private networks (Metro listens
  on 8081).
- Manual entry instead of the QR code: `exp://<PC-LAN-IP>:8081`
  (Expo Go → *Enter URL manually*).
- Still nothing: `npm run expo-go:tunnel` (Metro through ngrok). That tunnels
  **only Metro** — `EXPO_PUBLIC_API_URL` must still be reachable from the phone,
  otherwise the login screen times out.

## Expo Go refuses to open the project (SDK mismatch)

The store build of Expo Go only serves the SDK version it ships with, and this
project is SDK 57 (React Native 0.86). Update Expo Go from the store, then run
`npx expo install --check` to list packages whose versions drifted from the SDK
(`npx expo install --fix` aligns them).

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

The app quietly falls back to the combined "no account found, or the password
is incorrect" message. Apply migration `006_email_registered.sql` to the
connected Supabase project to enable the optional email availability check.

## Shared Users page shows a connection hint

`pages/accounts.tsx` calls `GET /accounts` (and `GET /accounts/invites`),
both behind `requireAuth`. A `401 Session is invalid or has expired` means
the app's Supabase session and the backend disagree — sign out and back in.
Account **creation** (`POST /accounts`) is still admin-only; a
`403 Admin privileges required` there means the signed-in user's role metadata
is `staff`. Roles come from `user_metadata.role` on the Supabase user — set
them in the Supabase dashboard (Auth → Users → user metadata) or create the
account via the admin invite flow.

If the invite popup says no users are available, `GET /accounts/invitable`
returned an empty list: every other active account already has a pending or
accepted invite with you (declined ones become available again).

## Google Sign-In: the browser opens and never comes back to the app

Every variant of this has one of five causes. Check them in order.

1. **Supabase's Site URL is still `http://localhost:3000`.** When the URL the app
   asks for is missing from the allow-list, Supabase does **not** error — it
   silently redirects to the Site URL. Set
   Supabase → Authentication → URL Configuration → **Site URL** to
   `bawatpiezaapp://oauth`. This is the usual reason a `localhost` page appears.
2. **The redirect URL is not allow-listed.** Supabase → Authentication →
   URL Configuration → **Redirect URLs** must contain the URL the app uses:
   `bawatpiezaapp://oauth` for builds, `http://localhost:8081/**` for Expo web on
   the PC, and `exp://192.168.1.30:8081/**` for Expo Go — with `192.168.1.30`
   replaced by your PC's LAN IP. See
   [features/google-sign-in.md](features/google-sign-in.md).

   > **"Please provide a valid URL" in that dialog** means the value is not a
   > URL at all. Two things cause it:
   > - **Quotes were pasted around the value.** The field is pattern-matched, so
   >   `'bawatpiezaapp://oauth'` is rejected while `bawatpiezaapp://oauth` is
   >   accepted. Strip the `'` characters.
   > - **A placeholder was pasted literally.** `<LAN-IP>` is a stand-in for your
   >   PC's IP, not a value — `http://<LAN-IP>:8081/**` can never parse. Use the
   >   real address (`ipconfig`, or `npm run expo-go:check`).
   >
   > A bare `exp://**` is also rejected: put the wildcard under a real host
   > (`exp://192.168.1.30:8081/**`).
3. **You are running Expo Go.** Expo Go contains no Google Sign-In native module,
   so the native sheet cannot run there. This repo's `.env` sets
   `EXPO_PUBLIC_GOOGLE_BROWSER_FALLBACK=1`, so the app instead opens Google in a
   browser tab and returns through the `exp://…/--/oauth` deep link — the exact
   URL is printed in the Metro console as
   `[google] Browser fallback redirect → …`, and it only completes when that
   `exp://` URL is allow-listed (cause 2). Without the flag the app cleanly
   alerts *"Google sign-in needs a development build..."*.
   For a flow that never leaves the app, generate a development build:
   `cd BawatPiezaApp && npx expo run:android` (or `eas build`).

4. **The Google provider is not enabled.** Sign-in fails with
   `Unsupported provider: provider is not enabled`. Enable it under
   Supabase → Authentication → Providers → Google with the **Web application**
   client ID + secret, and add the Android/iOS client IDs under
   *Authorized Client IDs* — without them a native sign-in can succeed at Google
   and still be rejected by Supabase.
5. **Android has no matching OAuth client.** `GoogleSignin.signIn()` returns no
   ID token when the app's package name (`app.json` → `android.package`,
   `com.bawatpieza.app`) and signing **SHA-1** are not registered on an Android
   OAuth client in Google Cloud Console.
6. Web relies on `detectSessionInUrl` with the implicit flow, and
   `googleRedirectUrl()` now returns the live `window.location.origin`, so the
   redirect lands on whatever origin the browser is already on — that origin
   still has to be allow-listed (cause 2).

`@react-native-google-signin/google-signin` used to sit in `package.json` imported
nowhere; it is now the primary native provider and is loaded through a guarded
`require()` (`loadGoogleSignin()` in `src/lib/supabase.ts`) so Expo Go, which
lacks the module, falls back to the browser instead of crashing.

## `TypeError: undefined is not a function` in `_layout.tsx` on every sign-in

The auth listener dispatched a DOM event through `window`, and both halves of its
guard passed on a phone:

- React Native aliases the global — `Libraries/Core/setUpGlobals.js` runs
  `global.window = global`, so `typeof window !== 'undefined'` is **true** on
  native.
- RN 0.86 also polyfills a DOM `CustomEvent`
  (`react-native/src/private/setup/setUpDOM.js` installs `Event`, `EventTarget`,
  `CustomEvent`, …), so `typeof CustomEvent !== 'undefined'` is true on native
  too — the old comment claiming otherwise is stale.
- Nothing puts `dispatchEvent` on the global object: it is an `EventTarget`
  method and `globalThis` is not an `EventTarget` on native.

Both checks passed, then `window.dispatchEvent(...)` called `undefined`. The event
now goes through `notifyWebHostOfSignIn()` in `src/app/_layout.tsx`, which tests
`Platform.OS === 'web'` and `typeof window.dispatchEvent === 'function'` rather
than `window` itself.

**Why it mattered beyond the log noise.** A throwing `onAuthStateChange` callback
is not harmless. Supabase runs each subscriber in its own `try`/`catch` and then
**rethrows the first captured error** out of `_notifyAllSubscribers`, and
`_setSession` only converts `AuthError`s (everything else is rethrown). The
rejection therefore surfaced from `setSession()` / `signInWithIdToken()` *after*
the session had been saved — a successful native Google sign-in reported
"Google sign in failed" while the user was in fact signed in. The handler is now
wrapped in `try`/`catch` so it can never do that again.

> **Watch for the same anti-pattern.** `typeof window === 'undefined'` is never a
> valid "am I in a browser?" test here — test the API you actually use.
> `webStorage` in `src/lib/supabase.ts` still guards on `window` and then calls
> `window.localStorage`; that is unreachable only because `storage` selects it
> solely when `Platform.OS === 'web'`.

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
