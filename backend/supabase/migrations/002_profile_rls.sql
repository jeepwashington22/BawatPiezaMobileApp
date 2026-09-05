-- ============================================================
-- Profile self-service RLS policies
-- Run this after 001_user_accounts.sql in Supabase SQL Editor
-- ============================================================

-- Users can READ their own profile row
create policy "users read own profile"
  on public.user_accounts for select
  using (id = auth.uid());

-- Users can UPDATE their own profile (name / contact only)
-- Role/status/is_active are NOT mutable by the owner here; those
-- require the admin-only accounts API.
create policy "users update own profile"
  on public.user_accounts for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Users can insert only their own row (id must equal their uid) --
-- normally the trigger handles this, but we allow it explicitly so
-- the profile page can repair a missing row.
create policy "users insert own profile"
  on public.user_accounts for insert
  with check (id = auth.uid());
