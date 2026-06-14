-- Mission Orchestrator — full bootstrap for remote Supabase SQL Editor
-- Run once in Dashboard → SQL → New query

-- S0: config
create table if not exists public.config (
  key text primary key,
  value jsonb not null
);
alter table public.config enable row level security;
drop policy if exists "config_select_authenticated" on public.config;
drop policy if exists "config_all_service_role" on public.config;
create policy "config_select_authenticated" on public.config for select to authenticated, anon using (true);
create policy "config_all_service_role" on public.config for all to service_role using (true) with check (true);

-- S2: world / belief
do $$ begin
  create type public.asset_kind as enum ('UAV', 'USV', 'UUV');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.asset_domain as enum ('air', 'surface', 'subsurface');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.fact_source as enum ('telemetry', 'sensor', 'estimate', 'operator');
exception when duplicate_object then null; end $$;

create table if not exists public.assets (
  id text primary key,
  kind public.asset_kind not null,
  domain public.asset_domain not null,
  depth_rating_m numeric not null,
  top_speed_kn numeric not null,
  gps_dependent boolean not null default false
);

create table if not exists public.asset_sensors (
  asset_id text not null references public.assets(id) on delete cascade,
  sensor text not null,
  base_quality numeric not null check (base_quality >= 0 and base_quality <= 1),
  max_range_km numeric not null,
  k_motion numeric not null default 0,
  primary key (asset_id, sensor)
);

create table if not exists public.world_truth (
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

create table if not exists public.reports (
  ts bigint not null,
  asset_id text not null references public.assets(id) on delete cascade,
  field text not null,
  value jsonb not null
);
create index if not exists reports_asset_ts on public.reports (asset_id, ts);

create table if not exists public.belief_facts (
  asset_id text not null references public.assets(id) on delete cascade,
  field text not null,
  value jsonb not null,
  ts bigint not null,
  source public.fact_source not null default 'telemetry',
  confidence numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  half_life_s numeric not null default 120,
  primary key (asset_id, field)
);

alter table public.assets enable row level security;
alter table public.asset_sensors enable row level security;
alter table public.world_truth enable row level security;
alter table public.reports enable row level security;
alter table public.belief_facts enable row level security;

drop policy if exists "assets_select" on public.assets;
drop policy if exists "assets_all_service" on public.assets;
create policy "assets_select" on public.assets for select to authenticated, anon using (true);
create policy "assets_all_service" on public.assets for all to service_role using (true) with check (true);

drop policy if exists "asset_sensors_select" on public.asset_sensors;
drop policy if exists "asset_sensors_all_service" on public.asset_sensors;
create policy "asset_sensors_select" on public.asset_sensors for select to authenticated, anon using (true);
create policy "asset_sensors_all_service" on public.asset_sensors for all to service_role using (true) with check (true);

drop policy if exists "world_truth_select" on public.world_truth;
drop policy if exists "world_truth_all_service" on public.world_truth;
create policy "world_truth_select" on public.world_truth for select to authenticated, anon using (true);
create policy "world_truth_all_service" on public.world_truth for all to service_role using (true) with check (true);

drop policy if exists "reports_select" on public.reports;
drop policy if exists "reports_all_service" on public.reports;
create policy "reports_select" on public.reports for select to authenticated, anon using (true);
create policy "reports_all_service" on public.reports for all to service_role using (true) with check (true);

drop policy if exists "belief_facts_select" on public.belief_facts;
drop policy if exists "belief_facts_all_service" on public.belief_facts;
create policy "belief_facts_select" on public.belief_facts for select to authenticated, anon using (true);
create policy "belief_facts_all_service" on public.belief_facts for all to service_role using (true) with check (true);

-- S4: missions
create table if not exists public.missions (
  id text primary key,
  name text not null,
  type text not null,
  priority numeric not null check (priority >= 0 and priority <= 1),
  human_desc text
);

create table if not exists public.tasks (
  id text primary key,
  mission_id text not null references public.missions(id) on delete cascade,
  w_t numeric not null check (w_t >= 0 and w_t <= 1),
  target_x numeric not null,
  target_y numeric not null,
  target_depth_m numeric not null default 0,
  window_end_s bigint
);

create table if not exists public.task_demands (
  task_id text not null references public.tasks(id) on delete cascade,
  sensor text not null,
  min_quality numeric not null check (min_quality >= 0 and min_quality <= 1),
  primary key (task_id, sensor)
);

create table if not exists public.task_constraints (
  task_id text not null references public.tasks(id) on delete cascade,
  kind text not null check (kind in ('depth', 'domain', 'los', 'capacity')),
  param jsonb not null default '{}',
  primary key (task_id, kind)
);

create table if not exists public.assignments (
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

drop policy if exists "missions_select" on public.missions;
drop policy if exists "missions_all_service" on public.missions;
create policy "missions_select" on public.missions for select to authenticated, anon using (true);
create policy "missions_all_service" on public.missions for all to service_role using (true) with check (true);

drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_all_service" on public.tasks;
create policy "tasks_select" on public.tasks for select to authenticated, anon using (true);
create policy "tasks_all_service" on public.tasks for all to service_role using (true) with check (true);

drop policy if exists "task_demands_select" on public.task_demands;
drop policy if exists "task_demands_all_service" on public.task_demands;
create policy "task_demands_select" on public.task_demands for select to authenticated, anon using (true);
create policy "task_demands_all_service" on public.task_demands for all to service_role using (true) with check (true);

drop policy if exists "task_constraints_select" on public.task_constraints;
drop policy if exists "task_constraints_all_service" on public.task_constraints;
create policy "task_constraints_select" on public.task_constraints for select to authenticated, anon using (true);
create policy "task_constraints_all_service" on public.task_constraints for all to service_role using (true) with check (true);

drop policy if exists "assignments_select" on public.assignments;
drop policy if exists "assignments_all_service" on public.assignments;
create policy "assignments_select" on public.assignments for select to authenticated, anon using (true);
create policy "assignments_all_service" on public.assignments for all to service_role using (true) with check (true);

-- S5: mission_state
create table if not exists public.mission_state (
  mission_id text not null references public.missions(id) on delete cascade,
  tick bigint not null,
  cov_baseline numeric not null,
  cov_now numeric not null,
  tier text not null,
  confidence numeric not null,
  time_to_act_s numeric not null,
  impact numeric not null,
  urgency numeric not null,
  salience numeric not null,
  primary key (mission_id, tick)
);
alter table public.mission_state enable row level security;
drop policy if exists "mission_state_select" on public.mission_state;
drop policy if exists "mission_state_all_service" on public.mission_state;
create policy "mission_state_select" on public.mission_state for select to authenticated, anon using (true);
create policy "mission_state_all_service" on public.mission_state for all to service_role using (true) with check (true);

-- S6: alert_log
create table if not exists public.alert_log (
  ts bigint not null,
  mission_id text not null references public.missions(id) on delete cascade,
  salience numeric not null,
  tier_change text,
  summary_text text,
  shown boolean not null default false,
  id bigint generated always as identity primary key
);
alter table public.alert_log enable row level security;
drop policy if exists "alert_log_select" on public.alert_log;
drop policy if exists "alert_log_all_service" on public.alert_log;
create policy "alert_log_select" on public.alert_log for select to authenticated, anon using (true);
create policy "alert_log_all_service" on public.alert_log for all to service_role using (true) with check (true);

-- S7/S8: plans
create table if not exists public.candidate_plans (
  plan_id text primary key,
  disruption_id text not null,
  moves jsonb not null default '[]',
  n_moves int not null default 0
);

create table if not exists public.plan_eval (
  plan_id text primary key references public.candidate_plans(plan_id) on delete cascade,
  cov_by_mission jsonb not null default '{}',
  objective numeric not null,
  total_exposure numeric not null default 0,
  cascades jsonb not null default '[]',
  assumptions jsonb not null default '[]'
);

create table if not exists public.decision_log (
  ts bigint not null,
  disruption_id text not null,
  plans_shown jsonb not null,
  chosen_plan_id text,
  operator text not null default 'system',
  id bigint generated always as identity primary key
);

alter table public.candidate_plans enable row level security;
alter table public.plan_eval enable row level security;
alter table public.decision_log enable row level security;

drop policy if exists "candidate_plans_all_service" on public.candidate_plans;
drop policy if exists "candidate_plans_select" on public.candidate_plans;
create policy "candidate_plans_all_service" on public.candidate_plans for all to service_role using (true) with check (true);
create policy "candidate_plans_select" on public.candidate_plans for select to authenticated, anon using (true);

drop policy if exists "plan_eval_all_service" on public.plan_eval;
drop policy if exists "plan_eval_select" on public.plan_eval;
create policy "plan_eval_all_service" on public.plan_eval for all to service_role using (true) with check (true);
create policy "plan_eval_select" on public.plan_eval for select to authenticated, anon using (true);

drop policy if exists "decision_log_all_service" on public.decision_log;
drop policy if exists "decision_log_select" on public.decision_log;
create policy "decision_log_all_service" on public.decision_log for all to service_role using (true) with check (true);
create policy "decision_log_select" on public.decision_log for select to authenticated, anon using (true);

-- Seed data
insert into public.assets (id, kind, domain, depth_rating_m, top_speed_kn, gps_dependent) values
  ('uuv-alpha', 'UUV', 'subsurface', 300, 8, false),
  ('usv-bravo', 'USV', 'surface', 0, 25, true)
on conflict (id) do nothing;

insert into public.asset_sensors (asset_id, sensor, base_quality, max_range_km, k_motion) values
  ('uuv-alpha', 'passive_acoustic', 0.9, 10, 1.6),
  ('usv-bravo', 'eo_ir', 0.85, 15, 0.36),
  ('usv-bravo', 'passive_acoustic', 0.7, 8, 1.6)
on conflict (asset_id, sensor) do nothing;

insert into public.missions (id, name, type, priority, human_desc) values
  ('mission-track', 'Submarine Track', 'track', 0.9, 'High-priority acoustic track'),
  ('mission-patrol', 'Surface Patrol', 'patrol', 0.4, 'Secondary surface patrol')
on conflict (id) do nothing;

insert into public.tasks (id, mission_id, w_t, target_x, target_y, target_depth_m, window_end_s) values
  ('task-track', 'mission-track', 1.0, 2, 0, 50, 3600),
  ('task-patrol', 'mission-patrol', 1.0, 5, 2, 0, null)
on conflict (id) do nothing;

insert into public.task_demands (task_id, sensor, min_quality) values
  ('task-track', 'passive_acoustic', 0.5),
  ('task-patrol', 'eo_ir', 0.4)
on conflict (task_id, sensor) do nothing;

insert into public.task_constraints (task_id, kind, param) values
  ('task-track', 'domain', '{"domain":"subsurface"}')
on conflict (task_id, kind) do nothing;

insert into public.assignments (id, asset_id, task_id, operating_point, issued_ts) values
  ('asn-1', 'uuv-alpha', 'task-track', 'FAST', 0),
  ('asn-2', 'usv-bravo', 'task-patrol', 'FAST', 0)
on conflict (id) do nothing;

insert into public.config (key, value) values
  ('H', '120'),
  ('sigma', '0.4'),
  ('T_ref', '600'),
  ('lambda_move', '0.05'),
  ('lambda_exp', '0.3'),
  ('lambda_risk', '0.2'),
  ('p', '0.5'),
  ('tier_full', '0.85'),
  ('tier_degraded', '0.60'),
  ('tier_at_risk', '0.30'),
  ('k_passive_acoustic', '1.6'),
  ('k_eo_ir', '0.36'),
  ('k_active_sonar', '0.29')
on conflict (key) do nothing;
