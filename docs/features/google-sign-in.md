# Google Sign-In

Signing in (or signing up) with a Google account, from `/login` and `/signup`.

| | |
| --- | --- |
| **Routes** | `BawatPiezaApp/src/app/login.tsx`, `BawatPiezaApp/src/app/signup.tsx` |
| **Source** | `BawatPiezaApp/src/lib/supabase.ts` → `signInWithGoogle()` |
| **Data** | 🟢 live — Supabase Auth (`google` provider) |
| **Provider** | Supabase Auth → Google, fed by Google Cloud OAuth clients |

---

## What the user sees

| Where the app runs | What happens |
| --- | --- |
| **Android / iOS dev or production build** | The **native Google account sheet** slides up. No browser, no redirect. |
| **Expo Go** | Browser round trip via `signInWithBrowserGoogle()` — this repo's `.env` sets `EXPO_PUBLIC_GOOGLE_BROWSER_FALLBACK=1`. Without the flag it throws `GoogleSignInUnavailableError` with an actionable message directing to build a dev client. |
| **Web** | Normal OAuth redirect to Google and back to the origin the app is served from. |

The first row is the intended experience on a phone. The second exists because
Expo Go cannot load `@react-native-google-signin/google-signin` (its TurboModule,
`RNGoogleSignin`, is not part of the Expo Go binary), and the native sheet is an
OS-level feature that cannot run without it.

`signInWithGoogle()` picks the path at runtime:

```
signInWithGoogle()
├── Platform.OS === 'web'        → signInWithOAuth({ redirectTo: window.location.origin + '/' })
│                                  detectSessionInUrl picks the session out of the URL
└── native
    ├── native module present    → signInWithNativeGoogle()
    │                              GoogleSignin.signIn() → idToken
    │                              supabase.auth.signInWithIdToken()   ← no browser
    └── native module absent     → signInWithBrowserGoogle() when opted-in via
                                   EXPO_PUBLIC_GOOGLE_BROWSER_FALLBACK=1
                                   (set in this repo's .env)
                                   → else throw GoogleSignInUnavailableError
```

The native module check uses `TurboModuleRegistry.get('RNGoogleSignin') != null`
*before* evaluating `@react-native-google-signin/google-signin`. The package
internally calls `TurboModuleRegistry.getEnforcing('RNGoogleSignin')` at import
time, which throws an invariant error if imported directly in Expo Go. The
probe prevents the package from loading when absent.


---

## Why a browser, and why `localhost`

Two independent settings decide where Google sends the user back, and **both
must name the app — not `localhost`**:

1. **Supabase → Authentication → URL Configuration → Site URL.**
   The default is `http://localhost:3000`. When the requested `redirectTo` is not
   in the allow-list, Supabase does **not** error — it silently redirects to the
   Site URL instead. That is the `localhost` page that dead-ends, and it is the
   single most common cause of "it redirects to the browser".
2. **Supabase → Authentication → URL Configuration → Redirect URLs.**
   Every URL the app asks for must be listed. `http://localhost:3000/**` is a
   leftover from web tutorials; add these instead:

   | Value | For |
   | --- | --- |
   | `bawatpiezaapp://oauth` | dev / production builds (native) |
   | `http://localhost:8081/**` | Expo web on the PC |
   | `http://192.168.1.30:8081/**` | Expo web opened from the phone |
   | `exp://192.168.1.30:8081/**` | Expo Go on a phone (the `Linking.createURL()` URL) |

   The IP above is an **example** — substitute your own PC's LAN IP
   (`ipconfig`, or `npm run expo-go:check`). It is the address Metro serves the
   bundle from, which is *not* what a stale `EXPO_PUBLIC_API_URL` claims.

   **Type the values exactly as they appear, and:**
   - **Do not add quotes.** The dialog pattern-matches the URL, so
     `'bawatpiezaapp://oauth'` fails with *"Please provide a valid URL"* while
     `bawatpiezaapp://oauth` is accepted.
   - **Never paste a placeholder literally.** A token like `<LAN-IP>` or
     `<your-PC-LAN-IP>` is a stand-in for a value, not a value — it can never
     parse as a URL. Replace it with the real address first.
   - **`exp://**` alone is rejected too.** The wildcard must sit under a real
     host: `exp://192.168.1.30:8081/**`.
   - The dialog takes a whole list at once (one URL per line), so the four rows
     above can be pasted in a single go.

`googleRedirectUrl()` in `src/lib/supabase.ts` returns the value the app asks
for — which is exactly what to allow-list:

- web → the live `window.location.origin`, so a phone loading the web build from
  `http://192.168.1.9:8081` comes back there instead of to `localhost`
- native → `bawatpiezaapp://oauth` (the `expo.scheme` in `app.json`)

Deep links only resolve when the **installed binary registers the scheme**.
`app.json` now declares the identity a build needs:

```json
"scheme": "bawatpiezaapp",
"ios": { "bundleIdentifier": "com.bawatpieza.app" },
"android": { "package": "com.bawatpieza.app" }
```

---

## Setup checklist

### 1. Google Cloud Console → APIs & Services → Credentials

| OAuth client type | Needs | Used for |
| --- | --- | --- |
| **Web application** | Authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback` | Supabase provider + the ID-token audience |
| **Android** | Package name `com.bawatpieza.app` + your signing key **SHA-1** | the native sheet on Android (`GoogleSignin.signIn()`) |
| **iOS** (only for iOS builds) | Bundle ID `com.bawatpieza.app` | the native sheet on iOS |

Get the debug SHA-1 with `cd android && ./gradlew signingReport`, or
`keytool -list -v -keystore <your>.keystore`. A **Play-signed** release also
needs the SHA-1 from Play Console → App integrity.

### 2. Supabase → Authentication → Providers → Google

- Enable the provider.
- **Client ID / Secret**: the **Web application** client from step 1.
- **Authorized Client IDs**: add the Android (and iOS) client IDs. Supabase only
  accepts an ID token whose `aud` is on this list — omitting it is why a native
  sign-in can succeed at Google and still fail at Supabase.

### 3. Supabase → Authentication → URL Configuration

Set the **Site URL** to `bawatpiezaapp://oauth` and add the Redirect URLs from
the table above. Supabase uses the Site URL as the fallback whenever a requested
`redirectTo` is not allow-listed, which is why a `localhost` page appears today.

> **Caveat:** the Site URL is also what Supabase substitution uses in *its own*
> email templates. If you rely on Supabase-generated confirmation links opening a
> web page, keep a web origin here instead and fix the problem purely through the
> **Redirect URLs** allow-list (step 2) — allow-listing the exact URL is what
> stops the fallback. This project's own e-mails are sent by `backend/` (Brevo),
> which builds its links from `FRONTEND_URL`, not from Supabase.

### 4. `BawatPiezaApp/.env`

```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=<web client id>.apps.googleusercontent.com
# EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios client id>.apps.googleusercontent.com
```

Restart `expo start` after editing — `EXPO_PUBLIC_*` values are inlined at build
time.

### 5. Build a dev client to get the no-browser flow

The native sheet requires a build that contains the module:

```bash
cd BawatPiezaApp
npx expo run:android          # local dev build (needs the Android SDK)
# or
eas build --profile development --platform android
```

Add the package's config plugin to `app.json` first, so the iOS URL scheme and
the Android `google-services` wiring are generated:

```json
"plugins": [
  "expo-router",
  ["@react-native-google-signin/google-signin", {
    "iosUrlScheme": "com.googleusercontent.apps.<IOS-CLIENT-ID-PREFIX>"
  }]
]
```

`iosUrlScheme` must start with `com.googleusercontent.apps.` and is the iOS
client ID reversed — the plugin throws during `expo prebuild` when it is
missing, which is why it is not committed with a placeholder value. The Android
side of that plugin reads `google-services.json` (project → the **Web**
client), which is also why it is added together with the real Google files.

---

## Errors and what they mean

`describeGoogleSignInError()` (`src/lib/supabase.ts`) turns the common failures
into the copy shown in the app:

| What you see | Cause |
| --- | --- |
| "Google sign-in is not enabled for this Supabase project…" | `Unsupported provider: provider is not enabled` — step 2 is incomplete |
| "Supabase rejected the Google token audience…" | the ID token's client ID is not in *Authorized Client IDs* |
| "…Add the URL under Supabase → Authentication → URL Configuration." | `redirectTo` not allow-listed |
| "Google returned no ID token…" | no Android OAuth client matching `com.bawatpieza.app` + SHA-1 |
| "Google Play Services is missing or out of date." | emulator without Play Services, or an outdated device |
| "Network error. Check your internet connection and try again." | transport failure |

Dismissing the sheet throws `GoogleSignInCancelledError` and is **silent** in the
UI — `isGoogleSignInCancelled()` tells the two apart. Sign-up deliberately does
not route these through `describeAuthError()`, which needs a `code`/`status` and
would flatten every configuration problem into "Network error".

---

## Terms & Conditions gate

`/signup` requires accepting the Terms before Google sign-up starts. Because the
sign-in hands the account to Supabase outside the form's state (and web reloads
the page entirely), the acceptance is parked in storage with
`markTermsAcceptancePending()` and attached to the account by
`flushPendingTermsAcceptance()` once `SIGNED_IN` fires. See [signup.md](signup.md).

---

## Related

- [../troubleshooting.md](../troubleshooting.md) — "Google Sign-In: the browser
  opens and never comes back to the app"
- [../configuration.md](../configuration.md) — mobile environment variables
- [../architecture.md](../architecture.md) — where Google Sign-In fits
