-- Replace the legacy UUID-based esp_devices registry with device_pairings.
-- Existing data is preserved by matching normalized MAC addresses to hub_id.
-- Abort before changing schema if every legacy device cannot be matched.
do $$
begin
  if exists (
    select 1
    from public.device_pairings dp
    group by regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
    having count(*) > 1
  ) then
    raise exception
      'Cannot migrate esp_devices: device_pairings contains duplicate normalized hub IDs';
  end if;

  if exists (
    select 1
    from public.esp_devices ed
    where (
      select count(*)
      from public.device_pairings dp
      where regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
        = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g')
    ) <> 1
  ) then
    raise exception
      'Cannot migrate esp_devices: every legacy device must have exactly one matching device_pairings.hub_id';
  end if;
end;
$$;

-- Preserve the existing zone association on the canonical device row.
alter table public.device_pairings
  add column location_zone uuid
  references public.zones(zone_id) on delete set null;

update public.device_pairings dp
set location_zone = ed.location_zone
from public.esp_devices ed
where ed.location_zone is not null
  and regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
    = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g');

-- Add hub-keyed references alongside the legacy UUID references.
alter table public.tiles add column hub_id text;
alter table public.system_energy_logs add column hub_id text;
alter table public.essential_loads add column hub_id text;
alter table public.system_reports add column hub_id text;
alter table public.ai_predictions add column hub_id text;
alter table public.system_status_checks add column hub_id text;
alter table public.distribution_actions add column hub_id text;
alter table public.system_health_logs add column hub_id text;

update public.tiles t
set hub_id = dp.hub_id
from public.esp_devices ed
join public.device_pairings dp
  on regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
    = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g')
where t.device_id = ed.device_id;

update public.system_energy_logs e
set hub_id = dp.hub_id
from public.esp_devices ed
join public.device_pairings dp
  on regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
    = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g')
where e.device_id = ed.device_id;

update public.essential_loads l
set hub_id = dp.hub_id
from public.esp_devices ed
join public.device_pairings dp
  on regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
    = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g')
where l.device_id = ed.device_id;

update public.system_reports r
set hub_id = dp.hub_id
from public.esp_devices ed
join public.device_pairings dp
  on regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
    = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g')
where r.device_id = ed.device_id;

update public.ai_predictions p
set hub_id = dp.hub_id
from public.esp_devices ed
join public.device_pairings dp
  on regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
    = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g')
where p.device_id = ed.device_id;

update public.system_status_checks s
set hub_id = dp.hub_id
from public.esp_devices ed
join public.device_pairings dp
  on regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
    = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g')
where s.device_id = ed.device_id;

update public.distribution_actions a
set hub_id = dp.hub_id
from public.esp_devices ed
join public.device_pairings dp
  on regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
    = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g')
where a.device_id = ed.device_id;

update public.system_health_logs h
set hub_id = dp.hub_id
from public.esp_devices ed
join public.device_pairings dp
  on regexp_replace(lower(dp.hub_id), '[:-]', '', 'g')
    = regexp_replace(lower(ed.mac_address::text), '[:-]', '', 'g')
where h.device_id = ed.device_id;

alter table public.tiles
  alter column hub_id set not null,
  add constraint tiles_hub_id_fkey
    foreign key (hub_id) references public.device_pairings(hub_id) on delete cascade;
alter table public.system_energy_logs
  alter column hub_id set not null,
  add constraint system_energy_logs_hub_id_fkey
    foreign key (hub_id) references public.device_pairings(hub_id) on delete cascade,
  add constraint system_energy_logs_hub_date_key unique (hub_id, log_date);
alter table public.essential_loads
  alter column hub_id set not null,
  add constraint essential_loads_hub_id_fkey
    foreign key (hub_id) references public.device_pairings(hub_id) on delete cascade;
alter table public.system_reports
  add constraint system_reports_hub_id_fkey
    foreign key (hub_id) references public.device_pairings(hub_id) on delete set null;
alter table public.ai_predictions
  alter column hub_id set not null,
  add constraint ai_predictions_hub_id_fkey
    foreign key (hub_id) references public.device_pairings(hub_id) on delete cascade;
alter table public.system_status_checks
  alter column hub_id set not null,
  add constraint system_status_checks_hub_id_fkey
    foreign key (hub_id) references public.device_pairings(hub_id) on delete cascade;
alter table public.distribution_actions
  alter column hub_id set not null,
  add constraint distribution_actions_hub_id_fkey
    foreign key (hub_id) references public.device_pairings(hub_id) on delete cascade;
alter table public.system_health_logs
  alter column hub_id set not null,
  add constraint system_health_logs_hub_id_fkey
    foreign key (hub_id) references public.device_pairings(hub_id) on delete cascade;

-- Replace UUID-based RLS policies before removing their device_id columns.
drop policy if exists "owners and shared users can read devices" on public.esp_devices;
drop policy if exists "owners and shared users can read tiles" on public.tiles;
drop policy if exists "owners and shared users can read energy logs" on public.system_energy_logs;
drop policy if exists "owners and shared users can read essential loads" on public.essential_loads;
drop policy if exists "owners and shared users can read system reports" on public.system_reports;
drop policy if exists "owners and shared users can read ai predictions" on public.ai_predictions;
drop policy if exists "owners and shared users can read status checks" on public.system_status_checks;
drop policy if exists "owners and shared users can read distribution actions" on public.distribution_actions;
drop policy if exists "owners and shared users can read health logs" on public.system_health_logs;
drop policy if exists "owners and shared users can read ai recommendations" on public.ai_recommendations;

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
      from public.device_pairings dp
      where dp.location_zone = target_zone_id
        and public.user_can_access_hub(dp.hub_id)
    )
    or exists (
      select 1
      from public.tiles t
      where t.zone_id = target_zone_id
        and public.user_can_access_hub(t.hub_id)
    )
  );
$$;

drop function public.user_can_access_device(uuid);

alter table public.tiles drop column device_id;
alter table public.system_energy_logs drop column device_id;
alter table public.essential_loads drop column device_id;
alter table public.system_reports drop column device_id;
alter table public.ai_predictions drop column device_id;
alter table public.system_status_checks drop column device_id;
alter table public.distribution_actions drop column device_id;
alter table public.system_health_logs drop column device_id;

drop table public.esp_devices;

-- Restore equivalent owner/shared read access using the canonical hub key.
create policy "owners and shared users can read tiles"
  on public.tiles for select to authenticated
  using (public.user_can_access_hub(hub_id));
create policy "owners and shared users can read energy logs"
  on public.system_energy_logs for select to authenticated
  using (public.user_can_access_hub(hub_id));
create policy "owners and shared users can read essential loads"
  on public.essential_loads for select to authenticated
  using (public.user_can_access_hub(hub_id));
create policy "owners and shared users can read system reports"
  on public.system_reports for select to authenticated
  using (
    user_id = auth.uid()
    or (hub_id is not null and public.user_can_access_hub(hub_id))
  );
create policy "owners and shared users can read ai predictions"
  on public.ai_predictions for select to authenticated
  using (public.user_can_access_hub(hub_id));
create policy "owners and shared users can read status checks"
  on public.system_status_checks for select to authenticated
  using (public.user_can_access_hub(hub_id));
create policy "owners and shared users can read distribution actions"
  on public.distribution_actions for select to authenticated
  using (public.user_can_access_hub(hub_id));
create policy "owners and shared users can read health logs"
  on public.system_health_logs for select to authenticated
  using (public.user_can_access_hub(hub_id));
create policy "owners and shared users can read ai recommendations"
  on public.ai_recommendations for select to authenticated
  using (
    exists (
      select 1
      from public.ai_predictions p
      where p.recommendation_id = ai_recommendations.recommendation_id
        and public.user_can_access_hub(p.hub_id)
    )
  );

-- Recreate useful indexes against the new hub key.
create index if not exists tiles_hub_id_idx
  on public.tiles(hub_id);
create index if not exists system_energy_logs_hub_date_idx
  on public.system_energy_logs(hub_id, log_date desc);
create index if not exists essential_loads_hub_id_idx
  on public.essential_loads(hub_id);
create index if not exists ai_predictions_hub_target_idx
  on public.ai_predictions(hub_id, target_time desc);
create index if not exists distribution_actions_hub_timestamp_idx
  on public.distribution_actions(hub_id, action_timestamp desc);
create index if not exists system_health_logs_hub_timestamp_idx
  on public.system_health_logs(hub_id, log_timestamp desc);
