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

drop policy if exists "service role manages device_access" on public.device_access;
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

drop trigger if exists sync_device_access_on_share_invite on public.share_invites;
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

drop trigger if exists sync_device_access_on_pairing on public.device_pairings;
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

-- RLS helpers let device-scoped policies recognize both the paired owner and
-- users granted access by an accepted share invite. SECURITY DEFINER avoids
-- recursive RLS checks on device_pairings/device_access.
create or replace function public.user_can_access_hub(target_hub_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.device_pairings dp
      where dp.hub_id = target_hub_id
        and dp.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.device_access da
      where da.hub_id = target_hub_id
        and da.user_id = auth.uid()
    )
  );
$$;

create or replace function public.get_hub_generation_summary(
  target_hub_id text,
  start_at timestamptz
)
returns table (
  log_day date,
  footsteps bigint,
  generated_kwh numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (timezone('Asia/Manila', kl.created_at))::date as log_day,
    count(*)::bigint as footsteps,
    (coalesce(sum(kl.energy_j), 0) / 3600000.0)::numeric as generated_kwh
  from public.kinetic_logs kl
  where kl.hub_id = target_hub_id
    and kl.created_at >= start_at
    and public.user_can_access_hub(target_hub_id)
  group by (timezone('Asia/Manila', kl.created_at))::date
  order by log_day;
$$;

create or replace function public.user_can_access_device(target_device_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.esp_devices ed
    where ed.device_id = target_device_id
      and (
        exists (
          select 1
          from public.device_pairings dp
          where dp.user_id = auth.uid()
            and regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
              = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g')
        )
        or exists (
          select 1
          from public.device_access da
          where da.user_id = auth.uid()
            and regexp_replace(lower(da.hub_id), '[:-]', '', 'g')
              = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g')
        )
      )
  );
$$;

create or replace function public.user_can_access_zone(target_zone_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.esp_devices ed
      where ed.location_zone = target_zone_id
        and public.user_can_access_device(ed.device_id)
    )
    or exists (
      select 1
      from public.tiles t
      where t.zone_id = target_zone_id
        and public.user_can_access_device(t.device_id)
    )
  );
$$;

drop policy if exists "shared users can view granted device pairings" on public.device_pairings;
create policy "shared users can view granted device pairings"
  on public.device_pairings for select to authenticated
  using (public.user_can_access_hub(hub_id));

revoke all on function public.user_can_access_hub(text) from public;
revoke all on function public.get_hub_generation_summary(text, timestamptz) from public;
revoke all on function public.user_can_access_device(uuid) from public;
revoke all on function public.user_can_access_zone(uuid) from public;
grant execute on function public.user_can_access_hub(text) to authenticated;
grant execute on function public.get_hub_generation_summary(text, timestamptz) to authenticated;
grant execute on function public.user_can_access_device(uuid) to authenticated;
grant execute on function public.user_can_access_zone(uuid) to authenticated;

-- Read access to device data is the same for the paired owner and accepted
-- shared users. Writes remain governed by each table's existing policies.
drop policy if exists "owners and shared users can read devices" on public.esp_devices;
create policy "owners and shared users can read devices"
  on public.esp_devices for select to authenticated
  using (public.user_can_access_device(device_id));

drop policy if exists "owners and shared users can read zones" on public.zones;
create policy "owners and shared users can read zones"
  on public.zones for select to authenticated
  using (public.user_can_access_zone(zone_id));

drop policy if exists "owners and shared users can read tiles" on public.tiles;
create policy "owners and shared users can read tiles"
  on public.tiles for select to authenticated
  using (public.user_can_access_device(device_id));

drop policy if exists "owners and shared users can read energy logs" on public.system_energy_logs;
create policy "owners and shared users can read energy logs"
  on public.system_energy_logs for select to authenticated
  using (public.user_can_access_device(device_id));

drop policy if exists "owners and shared users can read essential loads" on public.essential_loads;
create policy "owners and shared users can read essential loads"
  on public.essential_loads for select to authenticated
  using (public.user_can_access_device(device_id));

drop policy if exists "owners and shared users can read system reports" on public.system_reports;
create policy "owners and shared users can read system reports"
  on public.system_reports for select to authenticated
  using (
    user_id = auth.uid()
    or (device_id is not null and public.user_can_access_device(device_id))
  );

drop policy if exists "owners and shared users can read ai predictions" on public.ai_predictions;
create policy "owners and shared users can read ai predictions"
  on public.ai_predictions for select to authenticated
  using (public.user_can_access_device(device_id));

drop policy if exists "owners and shared users can read status checks" on public.system_status_checks;
create policy "owners and shared users can read status checks"
  on public.system_status_checks for select to authenticated
  using (public.user_can_access_device(device_id));

drop policy if exists "owners and shared users can read distribution actions" on public.distribution_actions;
create policy "owners and shared users can read distribution actions"
  on public.distribution_actions for select to authenticated
  using (public.user_can_access_device(device_id));

drop policy if exists "owners and shared users can read health logs" on public.system_health_logs;
create policy "owners and shared users can read health logs"
  on public.system_health_logs for select to authenticated
  using (public.user_can_access_device(device_id));

drop policy if exists "owners and shared users can read ai recommendations" on public.ai_recommendations;
create policy "owners and shared users can read ai recommendations"
  on public.ai_recommendations for select to authenticated
  using (
    exists (
      select 1
      from public.ai_predictions p
      where p.recommendation_id = ai_recommendations.recommendation_id
        and public.user_can_access_device(p.device_id)
    )
  );

-- Hub-keyed tables use the firmware MAC identifier directly. Replace their
-- former public read/write policies with access checks for signed-in users.
drop policy if exists "Allow public select on kinetic_logs" on public.kinetic_logs;
drop policy if exists "Allow public delete on kinetic_logs" on public.kinetic_logs;
drop policy if exists "owners and shared users can read kinetic logs" on public.kinetic_logs;
drop policy if exists "owners and shared users can delete kinetic logs" on public.kinetic_logs;
drop policy if exists "device owners can delete kinetic logs" on public.kinetic_logs;
create policy "owners and shared users can read kinetic logs"
  on public.kinetic_logs for select to authenticated
  using (public.user_can_access_hub(hub_id));
create policy "device owners can delete kinetic logs"
  on public.kinetic_logs for delete to authenticated
  using (
    exists (
      select 1
      from public.device_pairings dp
      where dp.hub_id = kinetic_logs.hub_id
        and dp.user_id = auth.uid()
    )
  );

drop policy if exists "Allow all access to thresholds" on public.system_thresholds;
drop policy if exists "owners and shared users can read thresholds" on public.system_thresholds;
drop policy if exists "owners and shared users can create thresholds" on public.system_thresholds;
drop policy if exists "owners and shared users can update thresholds" on public.system_thresholds;
create policy "owners and shared users can read thresholds"
  on public.system_thresholds for select to authenticated
  using (public.user_can_access_hub(hub_id));
create policy "owners and shared users can create thresholds"
  on public.system_thresholds for insert to authenticated
  with check (public.user_can_access_hub(hub_id));
create policy "owners and shared users can update thresholds"
  on public.system_thresholds for update to authenticated
  using (public.user_can_access_hub(hub_id))
  with check (public.user_can_access_hub(hub_id));