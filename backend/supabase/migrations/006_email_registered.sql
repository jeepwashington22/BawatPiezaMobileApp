  -- ============================================================
  -- BawatPieza - "Is this email registered?" helper
  -- Run this in: Supabase Dashboard > SQL Editor > New query
  -- ============================================================
  --
  -- WHY
  --   Supabase Auth answers `invalid_credentials` for BOTH "no such account" and
  --   "wrong password", so the app cannot tell them apart from the response
  --   alone. The Sign In screen needs those two cases to read differently, so it
  --   asks the database for a single boolean after a failed sign-in.
  --
  -- SECURITY NOTE (read this)
  --   This is an account-enumeration trade-off: anyone holding the public anon
  --   key can ask whether an email has an account. It is the same information the
  --   Sign Up screen already surfaces as "Email already used".
  --   Only a boolean is exposed - never names, roles, or any other row data - and
  --   the function runs as its owner, so row level security does not hide the
  --   answer. Pair it with rate limiting (Supabase Auth rate limits already apply
  --   to sign-in attempts).
  --   If you would rather not expose this, simply don't call the RPC from the
  --   app: the Sign In screen then falls back to the combined message
  --   "No account found for this email, or the password is incorrect."
  -- ============================================================

  create or replace function public.email_registered(check_email text)
  returns boolean
  language sql
  security definer
  set search_path = public, auth
  stable
  as $$
    select
      exists (
        select 1 from public.user_accounts
        where lower(email) = lower(btrim(check_email))
      )
      or exists (
        select 1 from auth.users
        where lower(email) = lower(btrim(check_email))
      );
  $$;

  -- Expose the boolean (and nothing else) to the app's anon / signed-in clients.
  revoke all on function public.email_registered(text) from public;
  grant execute on function public.email_registered(text) to anon, authenticated;

  -- ------------------------------------------------------------------
  -- VERIFY
  --   Replace with an address you know is registered, then one you know is not:
  --     select public.email_registered('someone@example.com');   -- expect true
  --     select public.email_registered('nobody@example.com');    -- expect false
  --   It must also be callable through the Data API:
  --     POST /rest/v1/rpc/email_registered   { "check_email": "someone@example.com" }
  -- ============================================================