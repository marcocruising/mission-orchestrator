-- S2: world / belief schema (RLS enabled)

create type public.asset_kind as enum ('UAV', 'USV', 'UUV');
create type public.asset_domain as enum ('air', 'surface', 'subsurface');
create type public.fact_source as enum ('telemetry', 'sensor', 'estimate', 'operator');

create table public.assets (
  id text primary key,
  kind public.asset_kind not null,
  domain public.asset_domain not null,
  depth_rating_m numeric not null,
  top_speed_kn numeric not null,
  gps_dependent boolean not null default false
);

create table public.asset_sensors (
  asset_id text not null references public.assets(id) on delete cascade,
  sensor text not null,
  base_quality numeric not null check (base_quality >= 0 and base_quality <= 1),
  max_range_km numeric not null,
  k_motion numeric not null default 0,
  primary key (asset_id, sensor)
);

create table public.world_truth (
  tick bigint not null,
  asset_id text not null references public.assets(id) on delete cascade,
  x_km numeric not null,
  y_km numeric not null,
  depth_m numeric not null default 0,
  speed_kn numeric not null default 0,
  heading_deg numeric not null default 0,
  battery_pct numeric not null default 100,
  health text not null default 'ok',
  comms_up boolean not null default true,
  gps_ok boolean not null default true,
  primary key (tick, asset_id)
);

create table public.reports (
  ts bigint not null,
  asset_id text not null references public.assets(id) on delete cascade,
  field text not null,
  value jsonb not null
);

create index reports_asset_ts on public.reports (asset_id, ts);

create table public.belief_facts (
  asset_id text not null references public.assets(id) on delete cascade,
  field text not null,
  value jsonb not null,
  ts bigint not null,
  source public.fact_source not null default 'telemetry',
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  half_life_s numeric not null default 120,
  primary key (asset_id, field)
);

-- RLS
alter table public.assets enable row level security;
alter table public.asset_sensors enable row level security;
alter table public.world_truth enable row level security;
alter table public.reports enable row level security;
alter table public.belief_facts enable row level security;

create policy "assets_select" on public.assets for select to authenticated, anon using (true);
create policy "assets_all_service" on public.assets for all to service_role using (true) with check (true);

create policy "asset_sensors_select" on public.asset_sensors for select to authenticated, anon using (true);
create policy "asset_sensors_all_service" on public.asset_sensors for all to service_role using (true) with check (true);

create policy "world_truth_select" on public.world_truth for select to authenticated, anon using (true);
create policy "world_truth_all_service" on public.world_truth for all to service_role using (true) with check (true);

create policy "reports_select" on public.reports for select to authenticated, anon using (true);
create policy "reports_all_service" on public.reports for all to service_role using (true) with check (true);

create policy "belief_facts_select" on public.belief_facts for select to authenticated, anon using (true);
create policy "belief_facts_all_service" on public.belief_facts for all to service_role using (true) with check (true);
