# Sign Up (Email + Password)

- **Route:** `/signup`
- **Source:** `BawatPiezaApp/src/app/signup.tsx`
- **API/Cloud:** Backend account endpoint (Supabase Admin Auth + Brevo OTP)
- **Status:** 🟢 live

---

## User flow

1. User completes three steps:
   - **First name**, optional **middle name**, and **last name**.
   - **Email address** and Philippine **contact number**.
   - **Password** and **confirm password**.
2. Local validation runs first (`src/lib/validation.ts`) — nothing hits the
   network until the fields are sane:
   - email matches a practical `name@domain.tld` pattern,
   - first and last name are valid,
   - contact number uses the `+639XXXXXXXXX` format,
   - password ≥ **8** characters (Supabase's own minimum is 6; the app is
     stricter), password === confirm.
3. The email step checks the `email_registered` RPC when migration
   `006_email_registered.sql` is available. If the check is unavailable, the
   final Supabase signup still reports duplicate email errors.
4. On submit → `POST /accounts/signup` creates an unconfirmed Supabase Auth
   user with the profile, contact, and Terms acceptance metadata, then emails
   a 6-digit code through the backend mailer. The backend does not create a
   client session during registration, so the auth gate cannot send the new
   user to the dashboard before verification.
5. The `handle_new_auth_user` trigger (migration 001/005) mirrors the metadata
   into the `user_accounts` table.
6. A success modal asks the user to enter the code. `POST
   /accounts/signup/verify` validates it, confirms the email, and activates the
   account. The user then continues to sign in with their credentials.
7. The user can request a replacement code with `POST
   /accounts/signup/resend`. Codes expire after 5 minutes, allow 5 attempts,
   and can be re-sent once per minute.
8. The app uses `TileLoader` while checking the email, creating the account,
   sending another code, or verifying the code.
9. Terms acceptance is required only when creating a new account. Existing
   users signing in with email/password do not see or need to accept the Terms
   again. First-time Google accounts accept during their onboarding; returning
   Google users skip that new-account step.

### Email delivery setup

Configure the backend Brevo SMTP settings (`BREVO_SMTP_USER`,
`BREVO_SMTP_KEY`, and optionally `MAIL_FROM`) so the mailer can deliver signup
verification codes. A mail failure is shown in the success modal, where the
user can retry sending the code.

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
