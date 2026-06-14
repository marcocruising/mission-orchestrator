-- S4: missions / assignments schema

create table public.missions (
  id text primary key,
  name text not null,
  type text not null,
  priority numeric not null check (priority >= 0 and priority <= 1),
  human_desc text
);

create table public.tasks (
  id text primary key,
  mission_id text not null references public.missions(id) on delete cascade,
  w_t numeric not null check (w_t >= 0 and w_t <= 1),
  target_x numeric not null,
  target_y numeric not null,
  target_depth_m numeric not null default 0,
  window_end_s bigint
);

create table public.task_demands (
  task_id text not null references public.tasks(id) on delete cascade,
  sensor text not null,
  min_quality numeric not null check (min_quality >= 0 and min_quality <= 1),
  primary key (task_id, sensor)
);

create table public.task_constraints (
  task_id text not null references public.tasks(id) on delete cascade,
  kind text not null check (kind in ('depth', 'domain', 'los', 'capacity')),
  param jsonb not null default '{}',
  primary key (task_id, kind)
);

create table public.assignments (
  id text primary key,
  asset_id text not null references public.assets(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  operating_point text not null default 'SLOW',
  issued_ts bigint not null default 0
);

alter table public.missions enable row level security;
alter table public.tasks enable row level security;
alter table public.task_demands enable row level security;
alter table public.task_constraints enable row level security;
alter table public.assignments enable row level security;

create policy "missions_select" on public.missions for select to authenticated, anon using (true);
create policy "missions_all_service" on public.missions for all to service_role using (true) with check (true);

create policy "tasks_select" on public.tasks for select to authenticated, anon using (true);
create policy "tasks_all_service" on public.tasks for all to service_role using (true) with check (true);

create policy "task_demands_select" on public.task_demands for select to authenticated, anon using (true);
create policy "task_demands_all_service" on public.task_demands for all to service_role using (true) with check (true);

create policy "task_constraints_select" on public.task_constraints for select to authenticated, anon using (true);
create policy "task_constraints_all_service" on public.task_constraints for all to service_role using (true) with check (true);

create policy "assignments_select" on public.assignments for select to authenticated, anon using (true);
create policy "assignments_all_service" on public.assignments for all to service_role using (true) with check (true);
