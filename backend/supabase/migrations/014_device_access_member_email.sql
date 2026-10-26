alter table public.device_access
  add column if not exists member_email text;

update public.device_access da
set member_email = u.email
from auth.users u
where u.id = da.user_id
  and da.member_email is distinct from u.email;

create or replace function public.sync_device_access_member_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select u.email
    into new.member_email
  from auth.users u
  where u.id = new.user_id;

  return new;
end;
$$;

drop trigger if exists sync_device_access_member_email on public.device_access;
create trigger sync_device_access_member_email
  before insert or update of user_id on public.device_access
  for each row execute function public.sync_device_access_member_email();

create or replace function public.sync_device_access_email_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.device_access
  set member_email = new.email
  where user_id = new.id
    and member_email is distinct from new.email;

  return new;
end;
$$;

drop trigger if exists sync_device_access_email_from_auth_user on auth.users;
create trigger sync_device_access_email_from_auth_user
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_device_access_email_from_auth_user();
