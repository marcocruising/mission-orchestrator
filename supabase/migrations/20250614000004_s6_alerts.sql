-- S6: alert_log

create table public.alert_log (
  ts bigint not null,
  mission_id text not null references public.missions(id) on delete cascade,
  salience numeric not null,
  tier_change text,
  summary_text text,
  shown boolean not null default false,
  id bigint generated always as identity primary key
);

alter table public.alert_log enable row level security;

create policy "alert_log_select" on public.alert_log for select to authenticated, anon using (true);
create policy "alert_log_all_service" on public.alert_log for all to service_role using (true) with check (true);
