-- S0: config tunables (RLS enabled)

create table if not exists public.config (
  key text primary key,
  value jsonb not null
);

alter table public.config enable row level security;

-- Service role bypasses RLS; anon gets read-only on config
create policy "config_select_authenticated"
  on public.config for select
  to authenticated, anon
  using (true);

create policy "config_all_service_role"
  on public.config for all
  to service_role
  using (true)
  with check (true);
