-- S7/S8: plans and decision log

create table public.candidate_plans (
  plan_id text primary key,
  disruption_id text not null,
  moves jsonb not null default '[]',
  n_moves int not null default 0
);

create table public.plan_eval (
  plan_id text primary key references public.candidate_plans(plan_id) on delete cascade,
  cov_by_mission jsonb not null default '{}',
  objective numeric not null,
  total_exposure numeric not null default 0,
  cascades jsonb not null default '[]',
  assumptions jsonb not null default '[]'
);

create table public.decision_log (
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

create policy "candidate_plans_all_service" on public.candidate_plans for all to service_role using (true) with check (true);
create policy "candidate_plans_select" on public.candidate_plans for select to authenticated, anon using (true);

create policy "plan_eval_all_service" on public.plan_eval for all to service_role using (true) with check (true);
create policy "plan_eval_select" on public.plan_eval for select to authenticated, anon using (true);

create policy "decision_log_all_service" on public.decision_log for all to service_role using (true) with check (true);
create policy "decision_log_select" on public.decision_log for select to authenticated, anon using (true);
