-- Energy management schema.
-- Parent tables are created before their dependents so every FK target exists.

create table if not exists public.zones (
  zone_id uuid primary key default gen_random_uuid(),
  zone_name text not null,
  building_area text
);

create table if not exists public.esp_devices (
  device_id uuid primary key default gen_random_uuid(),
  device_name text not null,
  location_zone uuid references public.zones(zone_id) on delete set null,
  ip_address inet,
  status text not null default 'offline',
  mac_address macaddr unique
);

create table if not exists public.tiles (
  tile_id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.esp_devices(device_id) on delete cascade,
  zone_id uuid references public.zones(zone_id) on delete set null,
  x_coord numeric(10, 3) not null,
  y_coord numeric(10, 3) not null,
  tile_status text not null default 'active'
);

create table if not exists public.system_energy_logs (
  log_id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.esp_devices(device_id) on delete cascade,
  log_date date not null,
  daily_total_piezo_wh numeric(14, 4) not null default 0,
  daily_total_grid_consumed_wh numeric(14, 4) not null default 0,
  daily_est_footsteps bigint not null default 0,
  total_grid_cost numeric(14, 4) not null default 0,
  unique (device_id, log_date),
  check (daily_total_piezo_wh >= 0),
  check (daily_total_grid_consumed_wh >= 0),
  check (daily_est_footsteps >= 0),
  check (total_grid_cost >= 0)
);

create table if not exists public.essential_loads (
  load_id uuid primary key default gen_random_uuid(),
  load_name text not null,
  rating_watts numeric(10, 3) not null,
  current_source text,
  device_id uuid not null references public.esp_devices(device_id) on delete cascade,
  status text not null default 'off',
  check (rating_watts >= 0)
);

create table if not exists public.grid_rates (
  rate_id uuid primary key default gen_random_uuid(),
  rate_period_name text not null,
  start_time time not null,
  end_time time not null,
  price_per_kwh numeric(12, 6) not null,
  rate_type text not null,
  check (price_per_kwh >= 0)
);

create table if not exists public.system_reports (
  report_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  date_created timestamptz not null default now(),
  period_start date not null,
  period_end date not null,
  summary_data jsonb not null default '{}'::jsonb,
  total_cost_savings numeric(14, 4) not null default 0,
  device_id uuid references public.esp_devices(device_id) on delete set null,
  check (period_end >= period_start)
);

-- Supporting parent for AI_Predictions.recommendation_id.
create table if not exists public.ai_recommendations (
  recommendation_id uuid primary key default gen_random_uuid(),
  recommendation text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_predictions (
  prediction_id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.esp_devices(device_id) on delete cascade,
  target_time timestamptz not null,
  predicted_piezo_power_wh numeric(14, 4),
  predicted_battery_wh numeric(14, 4),
  grid_peak_warning boolean not null default false,
  recommendation_id uuid references public.ai_recommendations(recommendation_id) on delete set null,
  check (predicted_piezo_power_wh is null or predicted_piezo_power_wh >= 0),
  check (predicted_battery_wh is null or predicted_battery_wh >= 0)
);

-- Supporting parent for Distribution_Actions.status_check_id.
create table if not exists public.system_status_checks (
  status_check_id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.esp_devices(device_id) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null
);

create table if not exists public.distribution_actions (
  action_id uuid primary key default gen_random_uuid(),
  action_timestamp timestamptz not null default now(),
  device_id uuid not null references public.esp_devices(device_id) on delete cascade,
  user_id uuid references public.user_accounts(id) on delete set null,
  reason text,
  old_source text,
  new_source text,
  status_check_id uuid references public.system_status_checks(status_check_id) on delete set null
);

create table if not exists public.system_health_logs (
  log_id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.esp_devices(device_id) on delete cascade,
  log_timestamp timestamptz not null default now(),
  log_level text not null,
  description text not null,
  maintenance_staff_id uuid references public.user_accounts(id) on delete set null
);

create index if not exists esp_devices_location_zone_idx
  on public.esp_devices(location_zone);
create index if not exists tiles_device_id_idx
  on public.tiles(device_id);
create index if not exists tiles_zone_id_idx
  on public.tiles(zone_id);
create index if not exists energy_logs_device_date_idx
  on public.system_energy_logs(device_id, log_date desc);
create index if not exists essential_loads_device_id_idx
  on public.essential_loads(device_id);
create index if not exists system_reports_user_created_idx
  on public.system_reports(user_id, date_created desc);
create index if not exists ai_predictions_device_target_idx
  on public.ai_predictions(device_id, target_time desc);
create index if not exists distribution_actions_device_timestamp_idx
  on public.distribution_actions(device_id, action_timestamp desc);
create index if not exists system_health_logs_device_timestamp_idx
  on public.system_health_logs(device_id, log_timestamp desc);

-- These tables are accessed through the authenticated backend until policies
-- are defined for owner/shared-device reads and writes.
alter table public.zones enable row level security;
alter table public.esp_devices enable row level security;
alter table public.tiles enable row level security;
alter table public.system_energy_logs enable row level security;
alter table public.essential_loads enable row level security;
alter table public.grid_rates enable row level security;
alter table public.system_reports enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.ai_predictions enable row level security;
alter table public.system_status_checks enable row level security;
alter table public.distribution_actions enable row level security;
alter table public.system_health_logs enable row level security;
