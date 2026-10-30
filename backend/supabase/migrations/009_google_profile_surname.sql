-- Keep Google profile surnames optional.
--
-- Google may omit family_name for accounts that do not have a surname. The
-- original auth mirror used "Unknown" as a placeholder, which then appeared
-- as the user's actual surname throughout the app.

alter table public.user_accounts
  alter column lastname drop not null;

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
  begin
    v_first := coalesce(
      nullif(meta->>'firstname', ''),
      nullif(meta->>'given_name', ''),
      nullif(split_part(coalesce(nullif(meta->>'full_name', ''), nullif(meta->>'name', ''), new.email), ' ', 1), ''),
      'Unknown'
    );
    v_last := coalesce(
      nullif(meta->>'lastname', ''),
      nullif(meta->>'last_name', ''),
      nullif(meta->>'family_name', ''),
      ''
    );
    v_role := case
      when coalesce(meta->>'role', 'staff') in ('admin', 'staff')
        then coalesce(meta->>'role', 'staff')
      else 'staff'
    end;

    if exists (
      select 1
      from public.user_accounts
      where email = new.email and id <> new.id
    ) then
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

-- Repair only rows still carrying the old placeholder. A real surname already
-- saved by the user must not be overwritten.
update public.user_accounts account
set lastname = coalesce(
  nullif(auth_user.raw_user_meta_data->>'lastname', ''),
  nullif(auth_user.raw_user_meta_data->>'last_name', ''),
  nullif(auth_user.raw_user_meta_data->>'family_name', ''),
  ''
)
from auth.users auth_user
where account.id = auth_user.id
  and account.lastname = 'Unknown';
