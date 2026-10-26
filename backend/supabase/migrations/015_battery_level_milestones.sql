create table if not exists public.battery_level_milestones (
  id uuid primary key default gen_random_uuid(),
  hub_id text not null
    references public.device_pairings(hub_id) on delete cascade,
  battery_percentage integer not null
    check (battery_percentage in (20, 50, 95, 100)),
  battery_voltage numeric(7, 2),
  reached_at timestamptz not null default now(),
  check (battery_voltage is null or battery_voltage >= 0)
);

create index if not exists battery_level_milestones_hub_reached_idx
  on public.battery_level_milestones(hub_id, reached_at desc);

alter table public.battery_level_milestones enable row level security;

drop policy if exists "device users can read battery milestones"
  on public.battery_level_milestones;
create policy "device users can read battery milestones"
  on public.battery_level_milestones
  for select to authenticated
  using (public.user_can_access_hub(hub_id));

grant select on public.battery_level_milestones to authenticated;
