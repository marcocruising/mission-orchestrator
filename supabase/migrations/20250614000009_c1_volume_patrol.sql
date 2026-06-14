-- C1: 3D volume patrol (AABB v1)

alter table public.tasks
  add column if not exists kind text not null default 'POINT'
    check (kind in ('POINT', 'AREA'));

alter table public.tasks
  add column if not exists footprint jsonb,
  add column if not exists z_min_m double precision,
  add column if not exists z_max_m double precision,
  add column if not exists revisit_interval_s bigint,
  add column if not exists cell_size_m double precision default 500;

create table if not exists public.task_volume_visits (
  task_id text not null references public.tasks(id) on delete cascade,
  cell_id text not null,
  last_visit_ts bigint not null,
  peak_quality double precision not null,
  primary key (task_id, cell_id)
);

alter table public.task_volume_visits enable row level security;

create policy "task_volume_visits_select" on public.task_volume_visits
  for select to authenticated, anon using (true);

create policy "task_volume_visits_all_service" on public.task_volume_visits
  for all to service_role using (true) with check (true);
