-- C2: directional sensor beam metadata (additive)

alter table public.asset_sensors
  add column if not exists beam_half_angle_deg double precision;
