-- Demo fleet + missions (S2/S4 seed)
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
  ('mission-patrol', 'Surface Patrol', 'patrol', 0.4, 'Secondary surface patrol'),
  ('mission-volume', 'Subsurface Box Patrol', 'patrol', 0.5, '3D AABB volume patrol demo (C1)')
on conflict (id) do nothing;

insert into public.tasks (id, mission_id, w_t, target_x, target_y, target_depth_m, window_end_s, kind, footprint, z_min_m, z_max_m, revisit_interval_s, cell_size_m) values
  ('task-track', 'mission-track', 1.0, 2, 0, 50, 3600, 'POINT', null, null, null, null, null),
  ('task-patrol', 'mission-patrol', 1.0, 5, 2, 0, null, 'POINT', null, null, null, null, null),
  ('task-volume', 'mission-volume', 1.0, 2, 0, 60, null, 'AREA',
    '{"kind":"aabb","center_x_km":2.0,"center_y_km":0.0,"half_width_km":1.0,"half_height_km":1.0}',
    -80, -40, 600, 500)
on conflict (id) do nothing;

insert into public.task_demands (task_id, sensor, min_quality) values
  ('task-track', 'passive_acoustic', 0.5),
  ('task-patrol', 'eo_ir', 0.4),
  ('task-volume', 'passive_acoustic', 0.5)
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
