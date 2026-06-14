-- A2: imported environmental field samples (salinity, sea state, wind, currents, fog)

create table public.environment_samples (
  ts bigint not null,
  kind text not null,
  x_km double precision not null,
  y_km double precision not null,
  depth_m double precision not null default 0,
  value double precision not null,
  primary key (ts, kind, x_km, y_km, depth_m)
);

alter table public.environment_samples enable row level security;

create policy "environment_samples_select" on public.environment_samples
  for select to authenticated, anon using (true);
create policy "environment_samples_all_service" on public.environment_samples
  for all to service_role using (true) with check (true);
