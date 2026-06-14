-- A1: external contact tracks (parallel to belief_facts for own assets)

create table public.tracks (
  id text primary key,
  estimate jsonb not null,
  last_updated bigint not null,
  contributing jsonb not null default '[]'::jsonb,
  classification text
);

alter table public.tracks enable row level security;

create policy "tracks_select" on public.tracks for select to authenticated, anon using (true);
create policy "tracks_all_service" on public.tracks for all to service_role using (true) with check (true);
