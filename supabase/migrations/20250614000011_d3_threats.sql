-- D3: threats and no-go zones for route exposure/risk (S11)

create table public.threats (
  id text primary key,
  x_km double precision not null,
  y_km double precision not null,
  radius_km double precision not null check (radius_km > 0),
  intensity double precision not null check (intensity >= 0 and intensity <= 1),
  z_min_m double precision,
  z_max_m double precision
);

create table public.no_go_zones (
  id text primary key,
  x_km double precision not null,
  y_km double precision not null,
  radius_km double precision not null check (radius_km > 0),
  z_min_m double precision,
  z_max_m double precision
);

alter table public.threats enable row level security;
alter table public.no_go_zones enable row level security;

create policy "threats_select" on public.threats
  for select to authenticated, anon using (true);
create policy "threats_all_service" on public.threats
  for all to service_role using (true) with check (true);

create policy "no_go_zones_select" on public.no_go_zones
  for select to authenticated, anon using (true);
create policy "no_go_zones_all_service" on public.no_go_zones
  for all to service_role using (true) with check (true);
