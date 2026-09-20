# Sign Up (Email + Password)

- **Route:** `/signup`
- **Source:** `BawatPiezaApp/src/app/signup.tsx`
- **API/Cloud:** Supabase Auth directly (`signUp`), welcome e-mail via backend
- **Status:** 🟢 live

---

## User flow

1. User fills in **full name**, **email**, **password**, **confirm password**.
2. Local validation runs first (`src/lib/validation.ts`) — nothing hits the
   network until the fields are sane:
   - email matches a practical `name@domain.tld` pattern,
   - full name ≥ 2 characters,
   - password ≥ **8** characters (Supabase's own minimum is 6; the app is
     stricter), password === confirm.
3. The **Terms & Conditions modal** must be opened and read to the end before
   the checkbox can be ticked (see [terms-and-conditions.md](terms-and-conditions.md)).
4. On submit → `supabase.auth.signUp({ email, password, options.data })` with
   user metadata: `full_name`, `firstname`, `lastname`, plus the Terms
   acceptance (`terms_accepted_at`, `terms_version`).
5. The `handle_new_auth_user` trigger (migration 001/005) mirrors the metadata
   into the `user_accounts` table.
6. A **welcome e-mail** is sent for brand-new accounts
   (`sendWelcomeEmailIfNew()` — only if the account was created < 2 min ago,
   calls `POST /accounts/welcome-email` on the backend).
7. Success → the user is signed in / asked to confirm the e-mail depending on
   the Supabase project's confirmation setting, and lands on **Home**.

## Errors

`describeAuthError()` maps every Supabase error code to friendly copy, e.g.:

| Code | Message shown |
| --- | --- |
| `email_exists` / `user_already_exists` | "Email already used. Sign in instead, or register with a different email address." |
| `weak_password` | "That password is too weak. Use at least 8 characters, mixing letters and numbers." |
| `over_email_send_rate_limit` | "Too many attempts. Please wait a few minutes before trying again." |
| transport failure | "Network error. Check your internet connection and try again." |

Network-shaped failures get the shared offline/unstable/rate-limited/timeout
treatment from `src/lib/network.ts`.

## Google alternative

The same screen offers **Continue with Google** — see
[google-sign-in.md](google-sign-in.md). The Terms gate applies there too, with
the acceptance parked in storage until the OAuth session exists.

## Related backend endpoint

- `POST /accounts/welcome-email` — public; body `{ email, fullName?, firstName? }`.
  Used only for brand-new accounts; non-fatal when it fails.
