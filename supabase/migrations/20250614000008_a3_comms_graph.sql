-- A3: comms graph — nodes and directed links for relay routing and per-link utilization

create table public.comms_nodes (
  id text primary key,
  kind text not null check (kind in ('asset', 'relay', 'shore', 'sat_terminal'))
);

create table public.comms_links (
  from_id text not null,
  to_id text not null,
  bandwidth_bps double precision not null,
  delay_s double precision not null default 0,
  ts bigint not null,
  primary key (from_id, to_id, ts)
);

alter table public.comms_nodes enable row level security;
alter table public.comms_links enable row level security;

create policy "comms_nodes_select" on public.comms_nodes
  for select to authenticated, anon using (true);
create policy "comms_nodes_all_service" on public.comms_nodes
  for all to service_role using (true) with check (true);

create policy "comms_links_select" on public.comms_links
  for select to authenticated, anon using (true);
create policy "comms_links_all_service" on public.comms_links
  for all to service_role using (true) with check (true);
