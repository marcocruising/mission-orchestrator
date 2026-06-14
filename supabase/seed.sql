-- Config tunables from README (demo knobs — correct ordering, not physics)
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
