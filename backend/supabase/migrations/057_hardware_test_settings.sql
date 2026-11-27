create table if not exists public.hardware_test_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  simulated_at timestamptz not null default now(),
  battery_percentage numeric(5, 2) not null default 100
    check (battery_percentage >= 0 and battery_percentage <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.hardware_test_settings enable row level security;
revoke all on public.hardware_test_settings from anon, authenticated;
grant all on public.hardware_test_settings to service_role;

insert into public.hardware_test_settings (id)
values (1)
on conflict (id) do nothing;
