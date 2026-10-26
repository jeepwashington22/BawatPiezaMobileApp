-- Track which users can access each paired hub. Accepted share invites grant
-- access automatically; declining or deleting an invite removes that grant.
create table if not exists public.device_access (
  hub_id text not null references public.device_pairings(hub_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete cascade,
  share_invite_id uuid not null unique
    references public.share_invites(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hub_id, user_id)
);

create index if not exists device_access_user_idx
  on public.device_access(user_id, created_at desc);

alter table public.device_access enable row level security;

create policy "service role manages device_access"
  on public.device_access for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.sync_device_access_for_share_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.device_access where share_invite_id = old.id;
    return old;
  end if;

  if new.status = 'accepted' then
    insert into public.device_access (hub_id, user_id, granted_by, share_invite_id, created_at)
    select dp.hub_id, new.invitee_id, new.inviter_id, new.id,
      coalesce(new.responded_at, now())
    from public.device_pairings dp
    where dp.user_id = new.inviter_id
    on conflict (share_invite_id) do update
      set hub_id = excluded.hub_id,
          user_id = excluded.user_id,
          granted_by = excluded.granted_by,
          created_at = excluded.created_at;
  else
    delete from public.device_access where share_invite_id = new.id;
  end if;

  return new;
end;
$$;

create trigger sync_device_access_on_share_invite
  after insert or update or delete on public.share_invites
  for each row execute function public.sync_device_access_for_share_invite();

create or replace function public.sync_device_access_for_pairing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.device_access (hub_id, user_id, granted_by, share_invite_id)
  select new.hub_id, si.invitee_id, si.inviter_id, si.id
  from public.share_invites si
  where si.inviter_id = new.user_id
    and si.status = 'accepted'
  on conflict (share_invite_id) do update
    set hub_id = excluded.hub_id,
        user_id = excluded.user_id,
        granted_by = excluded.granted_by;

  return new;
end;
$$;

create trigger sync_device_access_on_pairing
  after insert or update of hub_id, user_id on public.device_pairings
  for each row execute function public.sync_device_access_for_pairing();

-- Existing accepted invites should grant access immediately after migration.
insert into public.device_access (hub_id, user_id, granted_by, share_invite_id, created_at)
select dp.hub_id, si.invitee_id, si.inviter_id, si.id,
  coalesce(si.responded_at, si.created_at)
from public.share_invites si
join public.device_pairings dp on dp.user_id = si.inviter_id
where si.status = 'accepted'
on conflict (share_invite_id) do update
  set hub_id = excluded.hub_id,
      user_id = excluded.user_id,
      granted_by = excluded.granted_by;
