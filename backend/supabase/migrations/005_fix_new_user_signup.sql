-- ============================================================
-- BawatPieza - Fix: "Database error saving new user" on signup
-- Run this in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- SYMPTOM
--   Existing accounts can sign in, but NO new account can be created
--   (Google OAuth sign-up, email/password sign-up and admin invites all
--   fail). Supabase Auth answers with HTTP 500:
--
--     {"code":500,"error_code":"unexpected_failure",
--      "msg":"Database error saving new user"}
--
--   OAuth users see the raw message because GoTrue puts it in the
--   redirect query string (error_description) that the app surfaces.
--
-- CAUSE
--   Two AFTER INSERT triggers on auth.users run inside the same
--   transaction GoTrue uses to create the account. If either raises an
--   exception the whole transaction rolls back, so the user is never
--   created. Both of them can raise:
--
--   1. on_user_welcome_email -> public.send_welcome_email() (migration 004)
--      calls net.http_post() with json_build_object(...) (type json) and
--      json_build_object(...)::text (type text). pg_net's signature is
--         net.http_post(url text, body jsonb, params jsonb,
--                       headers jsonb, timeout_milliseconds int)
--      so the statement fails with
--         function net.http_post(url => text, headers => json, body => text)
--         does not exist
--      (the "params" argument is missing too, and pg_net is not enabled on
--      every project). The URL was also built from
--      current_setting('supabase.url'), which does not exist in Supabase,
--      so it always resolved to 'YOUR_PROJECT.supabase.co'.
--
--   2. on_auth_user_created -> public.handle_new_auth_user() (migration 001)
--      inserts into public.user_accounts, which has
--      `email text not null unique`. `on conflict (id) do nothing` does NOT
--      cover the unique-email index, and an unexpected `role` value would
--      also violate `check (role in ('admin','staff'))`. Any of those
--      aborts the signup.
--
-- FIX
--   * Rewrite both trigger functions so they can never block signup.
--   * Use jsonb_build_object + jsonb parameters (the documented pg_net form).
--   * Only call net.http_post when pg_net is actually installed.
--   * Guard the user_accounts insert against the unique-email clash and the
--     role check constraint.
--   * Map Google's given_name / family_name so new Google users get a real
--     first and last name instead of "Unknown".
--
-- NOTE: the app already sends the welcome email itself from the client
-- (sendWelcomeEmailIfNew() -> POST /accounts/welcome-email), so the trigger
-- is a best-effort second path and is now completely non-blocking.
-- ============================================================

-- ------------------------------------------------------------------
-- 1) Welcome-email trigger: fail-safe + correct pg_net call
-- ------------------------------------------------------------------
create or replace function public.send_welcome_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  -- Public project URL + public anon key (both already ship in the app
  -- bundle). The anon key is required because Supabase Edge Functions
  -- verify the JWT by default.
  project_url constant text := 'https://qbajmzjrnkxbsexzdixs.supabase.co';
  anon_key    constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiYWptempybmt4YnNleHpkaXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMDM1ODUsImV4cCI6MjEwMzU3OTU4NX0.90OEN6du1xSn725B7DHijW2KrmeB4ZdyAhzbe6r1ZlU';
  v_full_name text;
  v_first_name text;
begin
  -- Everything below is best-effort. A failed notification must never roll
  -- back the auth.users insert that GoTrue depends on.
  begin
    v_full_name := coalesce(new.raw_user_meta_data->>'full_name', new.email);
    v_first_name := coalesce(
      nullif(new.raw_user_meta_data->>'given_name', ''),
      nullif(new.raw_user_meta_data->>'firstname', ''),
      nullif(split_part(v_full_name, ' ', 1), ''),
      'there'
    );

    if exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'net' and p.proname = 'http_post'
    ) then
      perform net.http_post(
        url     := project_url || '/functions/v1/welcome-email',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || anon_key
                   ),
        body    := jsonb_build_object(
                     'email', new.email,
                     'full_name', v_full_name,
                     'first_name', v_first_name,
                     'created_at', to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
                   )
      );
    else
      raise warning '[welcome-email] pg_net is not enabled; skipped notification for %', new.email;
    end if;
  exception when others then
    raise warning '[welcome-email] ignored error % (%) for %', sqlstate, sqlerrm, new.email;
  end;

  return new;
end;
$$;

-- ------------------------------------------------------------------
-- 2) Auth-user mirror trigger: fail-safe + Google name mapping
-- ------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first text;
  v_last text;
  v_role text;
begin
  -- Best-effort mirror of auth.users into public.user_accounts. If the
  -- mirror fails the account still gets created: the app's profile page
  -- can repair a missing row afterwards (see the "users insert own
  -- profile" policy in 002_profile_rls.sql).
  begin
    v_first := coalesce(
      nullif(meta->>'firstname', ''),
      nullif(meta->>'given_name', ''),          -- Google
      nullif(split_part(coalesce(nullif(meta->>'full_name', ''), nullif(meta->>'name', ''), new.email), ' ', 1), ''),
      'Unknown'
    );
    v_last := coalesce(
      nullif(meta->>'lastname', ''),
      nullif(meta->>'family_name', ''),         -- Google
      'Unknown'
    );

    -- Never let an unexpected metadata value trip the role check constraint.
    v_role := case
                when coalesce(meta->>'role', 'staff') in ('admin', 'staff')
                  then coalesce(meta->>'role', 'staff')
                else 'staff'
              end;

    if exists (
      select 1 from public.user_accounts
      where email = new.email and id <> new.id
    ) then
      -- user_accounts.email is UNIQUE. Linking to another row would raise a
      -- duplicate-key error and abort the signup, so skip the mirror only.
      raise warning '[user_accounts] email % already exists for another id; mirror skipped', new.email;
    else
      insert into public.user_accounts
        (id, firstname, middlename, lastname, role, "contactNo", email, status, is_active)
      values (
        new.id,
        v_first,
        nullif(meta->>'middlename', ''),
        v_last,
        v_role,
        nullif(coalesce(meta->>'contactNo', meta->>'phone'), ''),
        new.email,
        case when new.email_confirmed_at is null then 'pending' else 'active' end,
        new.email_confirmed_at is not null
      )
      on conflict (id) do nothing;
    end if;
  exception when others then
    raise warning '[user_accounts] mirror ignored error % (%) for %', sqlstate, sqlerrm, new.email;
  end;

  return new;
end;
$$;

-- ------------------------------------------------------------------
-- 3) Re-assert the trigger wiring (idempotent)
-- ------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

drop trigger if exists on_user_welcome_email on auth.users;
create trigger on_user_welcome_email
  after insert on auth.users
  for each row
  when (new.email is not null)
  execute function public.send_welcome_email();

-- ------------------------------------------------------------------
-- 4) Optional: enable pg_net so the welcome-email trigger can actually
--    deliver. Requires the extension to be available on the project.
--    Uncomment to enable.
-- ------------------------------------------------------------------
-- create extension if not exists pg_net with schema net;

-- ------------------------------------------------------------------
-- VERIFY
--   a) Triggers are wired up:
--        select tgname, p.proname
--        from pg_trigger t
--        join pg_proc p on p.oid = t.tgfoid
--        where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
--
--   b) New signups work again - creating a throwaway account through the
--      app (or the Dashboard's "Add user") must no longer return
--      "Database error saving new user".
--
--   c) If a signup still fails, grab the error_id from the Auth response
--      and search for it in Supabase Dashboard > Authentication > Logs.
--      The log line contains the exact Postgres exception and the
--      statement that raised it.
--
-- HOUSEKEEPING
--   Any account that failed to be created left NO trace: GoTrue rolls the
--   whole transaction back, so there are no orphan auth.users or
--   user_accounts rows to clean up.
-- ============================================================
