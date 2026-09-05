-- ============================================================
-- BawatPieza - user_accounts table (synced with auth.users)
-- Run this in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create table if not exists public.user_accounts (
  id          uuid primary key references auth.users (id) on delete cascade,
  firstname   text not null,
  middlename  text,
  lastname    text not null,
  role        text not null default 'staff' check (role in ('admin', 'staff')),
  "contactNo" text,
  email       text not null unique,
  status      text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.user_accounts enable row level security;

-- Admin reads happen via the backend service-role key, which bypasses
-- RLS entirely. We do NOT reference user_accounts inside its own RLS
-- policy (that would cause infinite recursion). Regular users read their
-- own row via the "users read own profile" policy in 002_profile_rls.sql.
create policy "admins read user_accounts"
  on public.user_accounts for select
  using (auth.role() = 'service_role');

-- Keep user_accounts in sync whenever an auth user is created
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta jsonb := new.raw_user_meta_data;
begin
  insert into public.user_accounts (id, firstname, middlename, lastname, role, "contactNo", email, status, is_active)
  values (
    new.id,
    coalesce(meta->>'firstname', split_part(coalesce(meta->>'full_name', new.email), ' ', 1), 'Unknown'),
    nullif(meta->>'middlename', ''),
    coalesce(meta->>'lastname', 'Unknown'),
    coalesce(meta->>'role', 'staff'),
    nullif(meta->>'phone', ''),
    new.email,
    case when new.email_confirmed_at is null then 'pending' else 'active' end,
    new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill: pull in users that already exist in auth
insert into public.user_accounts (id, firstname, middlename, lastname, role, "contactNo", email, status, is_active)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'firstname', split_part(coalesce(u.raw_user_meta_data->>'full_name', u.email), ' ', 1), 'Unknown'),
  nullif(u.raw_user_meta_data->>'middlename', ''),
  coalesce(u.raw_user_meta_data->>'lastname', 'Unknown'),
  coalesce(u.raw_user_meta_data->>'role', 'staff'),
  nullif(u.raw_user_meta_data->>'phone', ''),
  u.email,
  case when u.email_confirmed_at is null then 'pending' else 'active' end,
  u.email_confirmed_at is not null
from auth.users u
on conflict (id) do nothing;
