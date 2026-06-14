-- S5: mission_state persistence

create table public.mission_state (
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

create policy "mission_state_select" on public.mission_state for select to authenticated, anon using (true);
create policy "mission_state_all_service" on public.mission_state for all to service_role using (true) with check (true);
