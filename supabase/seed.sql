-- Offshore pipeline & rig protection scenario (20×20 km, seafloor −60 m)
-- TypeScript mirror: apps/orchestrator/src/scenarios/offshore-pipeline.ts

truncate public.task_volume_visits,
  public.plan_eval,
  public.candidate_plans,
  public.alert_log,
  public.decision_log,
  public.mission_state,
  public.assignments,
  public.task_demands,
  public.task_constraints,
  public.tasks,
  public.missions,
  public.asset_sensors,
  public.assets
restart identity cascade;

insert into public.assets (id, kind, domain, depth_rating_m, top_speed_kn, gps_dependent) values
  ('usv-sentinel-a', 'USV', 'surface', 0, 22, true),
  ('usv-sentinel-b', 'USV', 'surface', 0, 22, true),
  ('uuv-guardian', 'UUV', 'subsurface', 350, 6, false),
  ('uav-overwatch', 'UAV', 'air', 5000, 45, true);

insert into public.asset_sensors (asset_id, sensor, base_quality, max_range_km, k_motion, beam_half_angle_deg) values
  ('usv-sentinel-a', 'eo_ir', 0.88, 12, 0.36, null),
  ('usv-sentinel-a', 'passive_acoustic', 0.72, 8, 1.6, null),
  ('usv-sentinel-b', 'eo_ir', 0.9, 14, 0.36, null),
  ('usv-sentinel-b', 'passive_acoustic', 0.75, 9, 1.6, null),
  ('uuv-guardian', 'passive_acoustic', 0.92, 10, 1.6, null),
  ('uuv-guardian', 'active_sonar', 0.85, 8, 0.29, 35),
  ('uav-overwatch', 'eo_ir', 0.93, 18, 0.25, null);

insert into public.missions (id, name, type, priority, human_desc) values
  ('mission-rig-guard', 'Oil rig protection', 'protect', 0.92, 'Surface and air watch on Alpha platform'),
  ('mission-pipeline-guard', 'Pipeline corridor protection', 'patrol', 0.88, 'Surface and seafloor patrol along export pipeline');

insert into public.tasks (id, mission_id, w_t, target_x, target_y, target_depth_m, window_end_s, kind, footprint, z_min_m, z_max_m, revisit_interval_s, cell_size_m) values
  ('task-rig-watch', 'mission-rig-guard', 0.55, 17, 10, 0, null, 'POINT', null, null, null, null, null),
  ('task-rig-air', 'mission-rig-guard', 0.45, 17, 10, 0, null, 'POINT', null, null, null, null, null),
  ('task-pipeline-surface', 'mission-pipeline-guard', 0.5, 9, 10, 0, null, 'AREA',
    '{"kind":"aabb","center_x_km":9.0,"center_y_km":10.0,"half_width_km":7.0,"half_height_km":0.75}',
    -2, 2, 900, 2000),
  ('task-pipeline-subsea', 'mission-pipeline-guard', 0.5, 9, 10, 60, null, 'AREA',
    '{"kind":"aabb","center_x_km":9.0,"center_y_km":10.0,"half_width_km":7.0,"half_height_km":0.75}',
    -65, -55, 900, 2000);

insert into public.task_demands (task_id, sensor, min_quality) values
  ('task-rig-watch', 'eo_ir', 0.45),
  ('task-rig-watch', 'passive_acoustic', 0.35),
  ('task-rig-air', 'eo_ir', 0.4),
  ('task-pipeline-surface', 'eo_ir', 0.38),
  ('task-pipeline-surface', 'passive_acoustic', 0.32),
  ('task-pipeline-subsea', 'passive_acoustic', 0.48);

insert into public.task_constraints (task_id, kind, param) values
  ('task-rig-watch', 'domain', '{"domain":"surface"}'),
  ('task-rig-air', 'domain', '{"domain":"air"}'),
  ('task-pipeline-surface', 'domain', '{"domain":"surface"}'),
  ('task-pipeline-subsea', 'domain', '{"domain":"subsurface"}'),
  ('task-pipeline-subsea', 'depth', '{"min_depth_m":55}');

insert into public.assignments (id, asset_id, task_id, operating_point, issued_ts) values
  ('asn-usv-pipeline', 'usv-sentinel-a', 'task-pipeline-surface', 'SLOW', 0),
  ('asn-usv-rig', 'usv-sentinel-b', 'task-rig-watch', 'STATION', 0),
  ('asn-uuv-pipeline', 'uuv-guardian', 'task-pipeline-subsea', '{"bearing":90,"speed":"SLOW"}', 0),
  ('asn-uav-rig', 'uav-overwatch', 'task-rig-air', 'FAST', 0);

insert into public.mission_state (mission_id, tick, cov_baseline, cov_now, tier, confidence, time_to_act_s, impact, urgency, salience) values
  ('mission-rig-guard', 0, 0.9, 0.9, 'FULL', 1.0, 600, 0.45, 0.5, 0.0),
  ('mission-pipeline-guard', 0, 0.85, 0.85, 'FULL', 1.0, 600, 0.38, 0.45, 0.0);

insert into public.config (key, value) values
  ('H', '120'),
  ('sigma', '0.35'),
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

-- D2: comms graph — multi-hop relay topology (delay_s = one sim tick per hop)
delete from public.comms_links where ts = 0 and to_id in ('relay-buoy', 'operator', 'sat-terminal', 'acoustic-gateway');
delete from public.comms_links where ts = 0 and from_id in (
  'usv-sentinel-a', 'usv-sentinel-b', 'uav-overwatch', 'uuv-guardian', 'acoustic-gateway', 'relay-buoy', 'sat-terminal'
);

insert into public.comms_nodes (id, kind) values
  ('relay-buoy', 'relay'),
  ('acoustic-gateway', 'relay'),
  ('sat-terminal', 'sat_terminal')
on conflict (id) do nothing;

insert into public.comms_links (from_id, to_id, bandwidth_bps, delay_s, ts) values
  ('usv-sentinel-a', 'relay-buoy', 500000, 1, 0),
  ('usv-sentinel-b', 'relay-buoy', 500000, 1, 0),
  ('uav-overwatch', 'sat-terminal', 2000000, 1, 0),
  ('uuv-guardian', 'acoustic-gateway', 8000, 1, 0),
  ('acoustic-gateway', 'operator', 50000, 1, 0),
  ('relay-buoy', 'operator', 1000000, 1, 0),
  ('sat-terminal', 'operator', 2000000, 1, 0);
