create table public.device_pairings (
  hub_id text not null,
  user_id uuid not null,
  last_connected timestamp with time zone default timezone('utc'::text, now()),
  fw_version text default '1.0.0'::text,
  constraint device_pairings_pkey primary key (hub_id),
  constraint device_pairings_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);

-- enable row level security so users can only see their own hardware
alter table public.device_pairings enable row level security;

create policy "users can view their own device pairings"
  on public.device_pairings
  for select
  using (auth.uid() = user_id);

create policy "users can insert their own device pairings"
  on public.device_pairings
  for insert
  with check (auth.uid() = user_id);

create policy "users can update their own device pairings"
  on public.device_pairings
  for update
  using (auth.uid() = user_id);