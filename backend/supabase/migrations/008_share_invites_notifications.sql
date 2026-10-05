-- ============================================================
-- BawatPieza - share invites + in-app notifications
-- Run this in: Supabase Dashboard > SQL Editor > New query
--
-- Two-step shared-user flow:
--   1. A user invites an existing account -> share_invites row
--      ('pending') + a notifications row for the invitee.
--   2. The invitee accepts -> status 'accepted' (they are now a
--      shared user) + a notifications row for the inviter.
-- ============================================================

create table if not exists public.share_invites (
  id           uuid primary key default gen_random_uuid(),
  inviter_id   uuid not null references auth.users (id) on delete cascade,
  invitee_id   uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  -- One row per direction: re-inviting after a decline reuses the row
  -- (the invite endpoint flips it back to 'pending').
  unique (inviter_id, invitee_id)
);

create index if not exists share_invites_invitee_idx
  on public.share_invites (invitee_id, status);
create index if not exists share_invites_inviter_idx
  on public.share_invites (inviter_id, status);

alter table public.share_invites enable row level security;

-- All reads/writes go through the backend's service-role key (bypasses RLS);
-- no client-side policies on purpose so users cannot forge invite rows.
create policy "service role manages share_invites"
  on public.share_invites for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  -- Recipient of the notification.
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Who caused it (inviter / accepter). Null when the actor was deleted.
  actor_id     uuid references auth.users (id) on delete set null,
  type         text not null check (type in ('share_invite', 'share_accepted', 'share_declined')),
  title        text not null,
  body         text,
  -- share_invites.id when the notification belongs to an invite.
  reference_id uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Owner-only reads. Writes happen through the backend service role, but the
-- update policy also lets the owner flip read_at directly if ever needed.
create policy "users read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "users mark own notifications read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);