-- Persist each paired hub's installed tile count and room/channel setup.
create table public.device_setups (
  hub_id text primary key
    references public.device_pairings(hub_id) on delete cascade,
  installed_tile_count integer not null
    check (installed_tile_count >= 6),
  channel_count integer not null
    check (channel_count between 1 and 5),
  room_count integer not null
    check (room_count >= 1),
  setup_payload jsonb not null
    check (
      setup_payload ->> 'version' = '1'
      and case
        when jsonb_typeof(setup_payload -> 'channels') = 'array'
          then jsonb_array_length(setup_payload -> 'channels') = channel_count
        else false
      end
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.device_setups enable row level security;

grant select, insert, update on public.device_setups to authenticated;
grant all on public.device_setups to service_role;

create policy "owners and shared users can read device setups"
  on public.device_setups for select to authenticated
  using (public.user_can_access_hub(hub_id));

create policy "device owners can create device setups"
  on public.device_setups for insert to authenticated
  with check (
    exists (
      select 1
      from public.device_pairings dp
      where dp.hub_id = device_setups.hub_id
        and dp.user_id = auth.uid()
    )
  );

create policy "device owners can update device setups"
  on public.device_setups for update to authenticated
  using (
    exists (
      select 1
      from public.device_pairings dp
      where dp.hub_id = device_setups.hub_id
        and dp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.device_pairings dp
      where dp.hub_id = device_setups.hub_id
        and dp.user_id = auth.uid()
    )
  );
