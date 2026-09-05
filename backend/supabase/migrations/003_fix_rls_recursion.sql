-- ============================================================
-- Fix: infinite recursion in user_accounts RLS
-- Run this in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Cause: the "admins read user_accounts" policy in 001 used
--   auth.role() = 'service_role'
-- which can recurse during policy evaluation. The service role
-- already bypasses RLS entirely, so the policy is redundant.

-- 1. Drop the recursive policy (safe if it does not exist).
   drop policy if exists "admins read user_accounts"
     on public.user_accounts;

-- 2. Ensure the self-service policies from 002 are intact so
--    authenticated users can still read/update their OWN row.
--    Drop first (idempotent), then recreate.
   drop policy if exists "users read own profile"
     on public.user_accounts;
   drop policy if exists "users update own profile"
     on public.user_accounts;
   drop policy if exists "users insert own profile"
     on public.user_accounts;

   create policy "users read own profile"
     on public.user_accounts for select
     using (id = auth.uid());

   create policy "users update own profile"
     on public.user_accounts for update
     using (id = auth.uid())
     with check (id = auth.uid());

   create policy "users insert own profile"
     on public.user_accounts for insert
     with check (id = auth.uid());