# Database & Storage

Everything BawatPieza keeps in Supabase. All migrations live in
`backend/supabase/migrations/` and are meant to be run **in order** from the
Supabase SQL Editor (see [getting-started.md](getting-started.md)).

---

## `user_accounts` table (migration 001)

Mirror of `auth.users`, kept in sync by a trigger, so the app can query names
and roles without hitting the auth schema.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | references `auth.users(id)` on delete cascade |
| `firstname` | text not null | |
| `middlename` | text | optional |
| `lastname` | text not null | |
| `role` | text | `'admin'` \| `'staff'` (default `staff`) |
| `contactNo` | text | quoted camelCase column |
| `email` | text unique not null | |
| `status` | text | `'pending'` \| `'active'` \| `'suspended'` (default `pending`) |
| `is_active` | boolean | default `false`; flipped to `true` on activation |
| `created_at` | timestamptz | default `now()` |

**Sync trigger** `handle_new_auth_user`: on every insert into `auth.users`, the
user's `raw_user_meta_data` (firstname/middlename/lastname/role/contactNo) is
copied into `user_accounts`. This covers Google sign-ups and app sign-ups.
The backend additionally **upserts** the row when it creates an account
(idempotent by `id`).

## Row Level Security

| Migration | Policy |
| --- | --- |
| 001 | `admins read user_accounts` — reads happen through the backend's service-role key which bypasses RLS |
| 002 | `users read own profile` / update-own — a signed-in user can only touch the row where `id = auth.uid()` |
| 003 | fixes the recursion danger of referencing `user_accounts` inside its own policies |

RLS recursion is the reason the admin list endpoint (`GET /accounts`) goes
through the backend instead of querying Supabase directly from the app.

## `email_registered` RPC (migration 006)

```sql
select email_registered(check_email := 'user@example.com');  -- boolean
```

Called by the login screen (`isEmailRegistered`) to turn the ambiguous
"no account found or wrong password" into a specific hint. Header of the
migration documents the account-enumeration trade-off.

## `avatars` Storage bucket (migration 007)

- Bucket `avatars`, **public read**, images only, 5 MB limit (bucket created
  via the Storage API; the migration adds the policies).
- Insert / update / delete allowed **only inside the owner's folder**
  `(storage.foldername(name))[1] = auth.uid()::text` — i.e. `avatars/<uid>/…`.
- Used by Profile and Edit Profile (`expo-image-picker` → `supabase.storage`
  upload → public URL saved to metadata/table).
- Verification snippet in the migration header: uploading to another user's
  folder must fail.

## Edge function — `welcome-email`

`backend/supabase/functions/welcome-email/` (Deno). Wired by migration
`004_welcome_email_trigger.sql` to fire on `auth.users` inserts, sending the
"Welcome to BawatPieza 🎉" e-mail. The backend exposes an equivalent endpoint
(`POST /accounts/welcome-email`) used by the app right after a brand-new Google
sign-in — both are idempotent-per-user and either may be used.

---

## Entity relationship (simplified)

```
auth.users (Supabase Auth)
   │ id (cascade delete)
   ▼
user_accounts ── trigger: handle_new_auth_user (001)
   │
   └─ read by: backend GET /accounts (service-role)
               app  edit-profile (RLS own-row)
               app  email_registered RPC (006)

storage.objects (bucket "avatars") ── policies in 007
   └─ path convention: avatars/<auth.uid()>/avatar.<ext>
```

## Changing the schema

1. Add a new numbered migration file in `backend/supabase/migrations/`
   (next number: `008_…`).
2. Run it in the Supabase SQL Editor.
3. Update this document and the API docs if endpoints/fields change.
4. Restart the backend — no code changes needed for new columns unless the
   routes select/insert them.
