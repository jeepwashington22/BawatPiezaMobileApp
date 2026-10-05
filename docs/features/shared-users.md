# Shared Users (invite & accept)

- **Route:** `/pages/accounts` (Account tab → "Shared Users" / "Manage Access")
- **Source:** `BawatPiezaApp/src/app/pages/accounts.tsx`
- **API:** `GET /accounts?shared=1`, `GET /accounts/invitable`,
  `POST /accounts/invite`, `GET /accounts/invites`,
  `POST /accounts/invites/:id/accept|decline`,
  `GET /notifications`, `POST /notifications/read` (all backend)
- **Data:** Supabase tables `share_invites` + `notifications` (migration 008)
- **Status:** 🟢 live

---

## User flow

The invite is a **two-step** handshake: an invite does not grant access by
itself — the invited user must accept, and only then are they a *shared user*.

1. **Invite.** On the account tab the user taps **＋ Invite existing user**. A
   popup loads `GET /accounts/invitable` — the list of *active* accounts that
   are neither the caller nor already invited/shared. If there are none, the
   popup says so instead of showing an empty list. Picking a user calls
   `POST /accounts/invite { inviteeId }`.
2. **Pending + notification.** The backend upserts a `share_invites` row with
   `status = 'pending'` and inserts a `notifications` row for the invitee
   (`type = 'share_invite'`): *"\<inviter\> invited you to share their
   BawatPieza account…"*.
3. **The invitee sees it.** The bell in the top bar fetches
   `GET /notifications` and shows an unread badge. The account tab also shows
   the invite in its own **"access invites for you"** card — with **Accept**
   and **Decline** buttons — because `GET /accounts/invites` returns every
   pending `received` invite.
4. **Accept → shared user.** `POST /accounts/invites/:id/accept` flips the row
   to `status = 'accepted'` and notifies the *inviter*
   (`type = 'share_accepted'`). The person now shows up in the other side's
   shared-users list.
5. **Decline** (`…/decline`) sets `status = 'declined'` and notifies the
   inviter (`type = 'share_declined'`). The pair becomes invitable again —
   the next `POST /accounts/invite` re-opens the same row.

## The shared-users list (accepted only)

The list calls **`GET /accounts?shared=1`**, which is scoped server-side:
the backend reads the caller's `share_invites` rows first and only selects
`user_accounts` rows whose invite is `status = 'accepted'`. Accounts that
never completed the handshake (or were never invited) are **never fetched**.
Without the flag the endpoint returns the full list, so other consumers
(web dashboard) are unchanged.

The screen is built around that guarantee:

- **Realtime search bar** (below the invite buttons) filters the list as you
  type — client-side over the rows already in memory, matching **name or
  email** (`matchesQuery`). The card title shows "N of M shared users" while
  filtering, a clear (✕) button resets it, and a *"No user found"* card
  explains a query with no matches. The invite popup has its own identical
  search bar for the candidate list.
- Card title **"N shared users"** (eyebrow *Shared users*) — every row is an
  accepted relationship, so each shows a green **Shared** dot-chip plus
  **"Shared since \<date\>"** from the invite's `responded_at`
  (`shared_since` in the response).
- **Empty state** explains why: *"Only people who accepted your invite appear
  here…"* with a pointer to the invite button.
- Screen title and loading copy say **Shared Users**, not "Accounts".
- Pending invites are NOT in this list — they live in the separate
  **"access invites for you"** card until answered.

## Notifications panel

`src/components/top-bar.tsx` loads the real feed on mount and every time the
bell opens:

- `share_invite` → person-add icon, amber tone; tapping it opens the account
  tab so the invite can be answered.
- `share_accepted` → people icon, green tone; `share_declined` → red-x, orange.
- **Mark all read** calls `POST /notifications/read` and clears the badge.
- When the API is unreachable (or before the first load) the panel falls back
  to the demo `MOCK_NOTIFICATIONS` so the bell is never dead.

## Guardrails

- Self-invite → `400`; invitee must be an active account → `409` otherwise.
- Duplicate pending/accepted pair → `409` (message says which).
- Only the invitee may answer an invite (`403` for anyone else) and only while
  it is `pending` (`409` after that).
- Notification inserts are best-effort: a failed insert is logged, never
  rolls back the invite.

## Related migration

`backend/supabase/migrations/008_share_invites_notifications.sql` — creates
both tables, indexes, and RLS (service-role only for `share_invites`;
owner-read for `notifications`).