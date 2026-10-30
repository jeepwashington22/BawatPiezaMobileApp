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

## `share_invites` + `notifications` tables (migration 008)

The Shared Users two-step invite flow (see
[features/shared-users.md](features/shared-users.md)):

| Table | Key columns | Notes |
| --- | --- | --- |
| `share_invites` | `inviter_id`, `invitee_id`, `status` (`pending`/`accepted`/`declined`), `created_at`, `responded_at` | `unique (inviter_id, invitee_id)` — re-inviting after a decline re-opens the same row |
| `notifications` | `user_id` (recipient), `actor_id`, `type` (`share_invite`/`share_accepted`/`share_declined`/`battery_full`/`battery_low`), `title`, `body`, `reference_id`, `read_at` | `reference_id` points at `share_invites.id` |

RLS: `share_invites` is service-role only (all access through the backend);
`notifications` lets the owner read/update their own rows. Backend endpoints:
`GET /accounts/invitable`, `POST /accounts/invite`, `GET /accounts/invites`,
`POST /accounts/invites/:id/accept|decline`, `GET /notifications`,
`POST /notifications/read`.

## Device access (migration 013)

`device_access` records the hub grants created for accepted shared-user
invites. Migration 014 adds `member_email`, populated from `auth.users.email`
for existing and future grants and kept synchronized if a member changes
their email. This makes the member identifiable in the `device_access` table
without relying on the UUID alone. The device-access policies in migration 013 let both the paired owner
and accepted shared users read the device, zone, tile, energy, report,
prediction, status, action, health, and kinetic-log data associated with that
hub. Shared users can also read and update the hub's system thresholds; they
cannot change device-scoped records unless another policy explicitly allows
it.

Hub-keyed data is checked against `device_pairings.hub_id`. Migration 018
removes the duplicate `esp_devices` registry and migrates the legacy
UUID-keyed energy-management tables to reference `device_pairings.hub_id`
directly. It preserves the old device-to-zone association in
`device_pairings.location_zone` and updates the RLS policies to use hub access.
The firmware's hub ID is the lowercase MAC address without colons. Before
changing any schema, migration 018 verifies every legacy `esp_devices` row has
exactly one matching pairing by normalized MAC; if not, it aborts so missing
data mappings can be resolved rather than discarding device data. Apply
migrations through 018 in order.

Device setup is stored in `device_setups` (migration 019), keyed by
`device_pairings.hub_id`. Each row records the installed tile count, channel
count, room count, and a versioned JSON payload containing the ordered
channels, room names, installed bulb counts, and each channel's
`priority_status` (`low`, `medium`, or `high`). Migration 020 defaults existing
channels to `medium` and validates the priority values. The setup screen begins
with one channel; owners can add up to four more. Owners can create or update
the setup, while paired owners and shared users can read it. Apply migrations
019 and 020 after migration 018 before saving setup from the app.

In the Allocation tab, channel priority percentages (Low 15, Medium 25, High
40) are weights rather than fixed portions. The app normalizes the configured
channels' weights across an 80% usable battery pool; the remaining 20% is
reserved and excluded from channel allocations. The automatic allocation
distributes each channel's proportional share of that usable pool.

When the user starts system allocation, the app sends each channel's
normalized allocation percentage and corresponding runtime in minutes to the
hub. The firmware powers the room relay for that runtime and turns it off
after the channel's dedicated allocation is consumed.

The home dashboard reads authorized `kinetic_logs` rows and aggregates daily
step counts and generated kWh in the app. The table's RLS policy checks the
caller's owner/shared access, so the owner and accepted shared users see the
same device history instead of per-account local counters or placeholder
generation figures.

Owners unlink a paired hub through `DELETE /accounts/device-access` with its
`hub_id`. The backend deletes only a pairing owned by the authenticated user;
the `device_access` foreign key cascades the shared grants for that hub. A
shared user can use the same endpoint to disconnect their own access; this
changes their accepted invite to declined and the migration 013 trigger removes
only their grant. The mobile app periodically revalidates access and clears
cached hub/shared-access IDs after the backend reports that access has ended.

Migration 013 is safe to re-run only before migration 018. If migration 013
was already applied before the device-data policies were added, run the updated
migration again to install those policies before applying 018. After migration
018, do not re-run migrations 012 or 013: both describe the retired
`esp_devices` UUID schema. Apply migration 014 after migration 013 to add and
populate member emails.

Battery milestone history is stored in `battery_level_milestones` (migration
015). It records only threshold readings of 20%, 50%, 95%, or 100%, along
with the hub ID, battery voltage, and time reached. The backend subscribes to
hub MQTT telemetry and inserts a record when telemetry enters one of those
thresholds, so recording does not depend on a dashboard being open. Reaching
the same threshold again after moving away creates another history row. The
table's read policy allows the paired owner and accepted shared users to view
the same history; only the backend writes records. Migration 016 adds the
`battery_full` and `battery_low` notification types. When battery telemetry
reaches 100% or 20%, the backend notifies the paired owner and all users with
device access. At 20%, it also publishes the firmware's `force_grid` command
unless telemetry already reports Grid mode; it retries at a limited interval
until Grid mode is reported. Apply migrations 015 and 016 after migration 014
before restarting the backend with the battery listener enabled.

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
   (next number: `009_…`).
2. Run it in the Supabase SQL Editor.
3. Update this document and the API docs if endpoints/fields change.
4. Restart the backend — no code changes needed for new columns unless the
   routes select/insert them.
