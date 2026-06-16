import type { Asset, AssetSensor, Assignment, CommsLinkRow, MissionDef } from "@mission-orchestrator/engine";
import type { WorldTruthRow } from "@mission-orchestrator/engine";
import { buildCommsModel, kmToM, buildRoutePlanner } from "@mission-orchestrator/engine";

/** 20×20 km operating area; seafloor at depth 60 m (z = −60). */
export const SCENARIO_META = {
  id: "offshore-pipeline",
  name: "Offshore pipeline & rig protection",
  bounds_km: { min: 0, max: 20 },
  seafloor_depth_m: 60,
  seafloor_z_m: -60,
  oil_rig: { x_km: 17, y_km: 10 },
  pipeline: {
    center_x_km: 9,
    center_y_km: 10,
    half_width_km: 7,
    half_height_km: 0.75,
  },
  /** North Sea sector — SW corner of the local km grid (D1-import geo anchor). */
  geo: {
    origin_lat: 56.5,
    origin_lon: 1.0,
  },
  env: {
    reference_iso: "2026-06-15T12:00:00Z",
    tick_duration_s: 3600,
    grid_step_km: 5,
    depths_m: [0, 60] as const,
  },
} as const;

/** Config for @mission-orchestrator/env-import fetchers. */
export const SCENARIO_ENV_CONFIG = {
  geo: SCENARIO_META.geo,
  reference_iso: SCENARIO_META.env.reference_iso,
  tick_duration_s: SCENARIO_META.env.tick_duration_s,
  bounds_km: SCENARIO_META.bounds_km,
  grid_step_km: SCENARIO_META.env.grid_step_km,
  depths_m: SCENARIO_META.env.depths_m,
};

/**
 * Offshore comms topology (D2). Sim clock uses tick index as time; delay_s is one tick per hop.
 * UUV: 2-hop acoustic path (uuv → gateway → operator). USV/UAV: 2-hop via relay/sat.
 * UUV link fails at tick 2 (subsea); link-down reaches operator at tick 4.
 */
export const SCENARIO_COMMS_LINKS: CommsLinkRow[] = [
  { from_id: "usv-sentinel-a", to_id: "relay-buoy", bandwidth_bps: 500_000, delay_s: 1, ts: 0 },
  { from_id: "usv-sentinel-b", to_id: "relay-buoy", bandwidth_bps: 500_000, delay_s: 1, ts: 0 },
  { from_id: "uav-overwatch", to_id: "sat-terminal", bandwidth_bps: 2_000_000, delay_s: 1, ts: 0 },
  { from_id: "uuv-guardian", to_id: "acoustic-gateway", bandwidth_bps: 8_000, delay_s: 1, ts: 0 },
  { from_id: "acoustic-gateway", to_id: "operator", bandwidth_bps: 50_000, delay_s: 1, ts: 0 },
  { from_id: "relay-buoy", to_id: "operator", bandwidth_bps: 1_000_000, delay_s: 1, ts: 0 },
  { from_id: "sat-terminal", to_id: "operator", bandwidth_bps: 2_000_000, delay_s: 1, ts: 0 },
];

export const SCENARIO_COMMS_MODEL = buildCommsModel(SCENARIO_COMMS_LINKS);

/** D3: hostile surface contact east of pipeline; fisher no-go blocks shortcut. */
export const SCENARIO_THREATS = [
  { id: "threat-hostile-surface", x_km: 6.0, y_km: 10.0, radius_km: 2.5, intensity: 0.85, z_min_m: -2, z_max_m: 50 },
] as const;

export const SCENARIO_NO_GO_ZONES = [
  { id: "ngo-fisher-exclusion", x_km: 4.5, y_km: 9.5, radius_km: 1.2, z_min_m: -2, z_max_m: 50 },
] as const;

export const SCENARIO_ROUTE_PLANNER = buildRoutePlanner(SCENARIO_THREATS, SCENARIO_NO_GO_ZONES);

export const OFFSHORE_ASSETS: Asset[] = [
  {
    id: "usv-sentinel-a",
    kind: "USV",
    domain: "surface",
    depth_rating_m: 0,
    top_speed_kn: 22,
    gps_dependent: true,
  },
  {
    id: "usv-sentinel-b",
    kind: "USV",
    domain: "surface",
    depth_rating_m: 0,
    top_speed_kn: 22,
    gps_dependent: true,
  },
  {
    id: "uuv-guardian",
    kind: "UUV",
    domain: "subsurface",
    depth_rating_m: 350,
    top_speed_kn: 6,
    gps_dependent: false,
  },
  {
    id: "uav-overwatch",
    kind: "UAV",
    domain: "air",
    depth_rating_m: 5000,
    top_speed_kn: 45,
    gps_dependent: true,
  },
];

export const OFFSHORE_SENSORS: AssetSensor[] = [
  { asset_id: "usv-sentinel-a", sensor: "eo_ir", base_quality: 0.88, max_range_km: 12, k_motion: 0.36 },
  { asset_id: "usv-sentinel-a", sensor: "passive_acoustic", base_quality: 0.72, max_range_km: 8, k_motion: 1.6 },
  { asset_id: "usv-sentinel-b", sensor: "eo_ir", base_quality: 0.9, max_range_km: 14, k_motion: 0.36 },
  { asset_id: "usv-sentinel-b", sensor: "passive_acoustic", base_quality: 0.75, max_range_km: 9, k_motion: 1.6 },
  {
    asset_id: "uuv-guardian",
    sensor: "passive_acoustic",
    base_quality: 0.92,
    max_range_km: 10,
    k_motion: 1.6,
  },
  {
    asset_id: "uuv-guardian",
    sensor: "active_sonar",
    base_quality: 0.85,
    max_range_km: 8,
    k_motion: 0.29,
    beam_half_angle_deg: 35,
  },
  { asset_id: "uav-overwatch", sensor: "eo_ir", base_quality: 0.93, max_range_km: 18, k_motion: 0.25 },
];

const pipelineFootprint = {
  kind: "aabb" as const,
  center: { x_m: kmToM(SCENARIO_META.pipeline.center_x_km), y_m: kmToM(SCENARIO_META.pipeline.center_y_km) },
  half_extent_m: {
    x: kmToM(SCENARIO_META.pipeline.half_width_km),
    y: kmToM(SCENARIO_META.pipeline.half_height_km),
  },
};

export const OFFSHORE_MISSIONS: MissionDef[] = [
  {
    id: "mission-rig-guard",
    name: "Oil rig protection",
    priority: 0.92,
    tasks: [
      {
        id: "task-rig-watch",
        mission_id: "mission-rig-guard",
        w_t: 0.55,
        kind: "POINT",
        target_x: SCENARIO_META.oil_rig.x_km,
        target_y: SCENARIO_META.oil_rig.y_km,
        target_depth_m: 0,
        window_end_s: null,
        demands: [
          { sensor: "eo_ir", min_quality: 0.45 },
          { sensor: "passive_acoustic", min_quality: 0.35 },
        ],
        constraints: [{ kind: "domain", param: { domain: "surface" } }],
      },
      {
        id: "task-rig-air",
        mission_id: "mission-rig-guard",
        w_t: 0.45,
        kind: "POINT",
        target_x: SCENARIO_META.oil_rig.x_km,
        target_y: SCENARIO_META.oil_rig.y_km,
        target_depth_m: 0,
        window_end_s: null,
        demands: [{ sensor: "eo_ir", min_quality: 0.4 }],
        constraints: [{ kind: "domain", param: { domain: "air" } }],
      },
    ],
  },
  {
    id: "mission-pipeline-guard",
    name: "Pipeline corridor protection",
    priority: 0.88,
    tasks: [
      {
        id: "task-pipeline-surface",
        mission_id: "mission-pipeline-guard",
        w_t: 0.5,
        kind: "AREA",
        target_x: SCENARIO_META.pipeline.center_x_km,
        target_y: SCENARIO_META.pipeline.center_y_km,
        target_depth_m: 0,
        window_end_s: null,
        demands: [
          { sensor: "eo_ir", min_quality: 0.38 },
          { sensor: "passive_acoustic", min_quality: 0.32 },
        ],
        constraints: [{ kind: "domain", param: { domain: "surface" } }],
        area: {
          footprint: pipelineFootprint,
          z_min_m: -2,
          z_max_m: 2,
          revisit_interval_s: 900,
          cell_size_m: 2000,
        },
      },
      {
        id: "task-pipeline-subsea",
        mission_id: "mission-pipeline-guard",
        w_t: 0.5,
        kind: "AREA",
        target_x: SCENARIO_META.pipeline.center_x_km,
        target_y: SCENARIO_META.pipeline.center_y_km,
        target_depth_m: SCENARIO_META.seafloor_depth_m,
        window_end_s: null,
        demands: [{ sensor: "passive_acoustic", min_quality: 0.48 }],
        constraints: [
          { kind: "domain", param: { domain: "subsurface" } },
          { kind: "depth", param: { min_depth_m: 55 } },
        ],
        area: {
          footprint: pipelineFootprint,
          z_min_m: -65,
          z_max_m: -55,
          revisit_interval_s: 900,
          cell_size_m: 2000,
        },
      },
    ],
  },
];

export const OFFSHORE_ASSIGNMENTS: Assignment[] = [
  {
    id: "asn-usv-pipeline",
    asset_id: "usv-sentinel-a",
    task_id: "task-pipeline-surface",
    operating_point: "SLOW",
    issued_ts: 0,
  },
  {
    id: "asn-usv-rig",
    asset_id: "usv-sentinel-b",
    task_id: "task-rig-watch",
    operating_point: "STATION",
    issued_ts: 0,
  },
  {
    id: "asn-uuv-pipeline",
    asset_id: "uuv-guardian",
    task_id: "task-pipeline-subsea",
    operating_point: '{"bearing":90,"speed":"SLOW"}',
    issued_ts: 0,
  },
  {
    id: "asn-uav-rig",
    asset_id: "uav-overwatch",
    task_id: "task-rig-air",
    operating_point: "FAST",
    issued_ts: 0,
  },
];

export const OFFSHORE_COV_BASELINES = new Map<string, number>([
  ["mission-rig-guard", 0.9],
  ["mission-pipeline-guard", 0.85],
]);

type TimelineOverride = Partial<Omit<WorldTruthRow, "tick" | "asset_id">> & { z_m?: number };

/** Scripted positions for ticks 0–8 (km, depth_m, z_m for UAV). */
export function buildOffshoreTimeline(): Map<number, Map<string, TimelineOverride>> {
  const seafloor = SCENARIO_META.seafloor_depth_m;
  const timeline = new Map<number, Map<string, TimelineOverride>>();

  timeline.set(0, new Map([
    ["usv-sentinel-a", { x_km: 3, y_km: 9.5, speed_kn: 8, heading_deg: 90 }],
    ["usv-sentinel-b", { x_km: 16.2, y_km: 11, speed_kn: 0, heading_deg: 225 }],
    ["uuv-guardian", { x_km: 3, y_km: 10, depth_m: seafloor, speed_kn: 4, heading_deg: 90 }],
    ["uav-overwatch", { x_km: 15, y_km: 8, z_m: 400, speed_kn: 35, heading_deg: 45 }],
  ]));

  timeline.set(1, new Map([
    ["usv-sentinel-a", { x_km: 5, y_km: 9.8, speed_kn: 8, heading_deg: 85 }],
    ["usv-sentinel-b", { x_km: 16.4, y_km: 10.8, speed_kn: 2, heading_deg: 200 }],
    ["uuv-guardian", { x_km: 5, y_km: 10, depth_m: seafloor, speed_kn: 4, heading_deg: 90 }],
    ["uav-overwatch", { x_km: 16, y_km: 9, z_m: 420, speed_kn: 38, heading_deg: 50 }],
  ]));

  // Subsea link fails tick 2; operator learns tick 4 (2-hop). USV low batt tick 2 → urgency at tick 4.
  timeline.set(2, new Map([
    ["usv-sentinel-a", { x_km: 7, y_km: 10, speed_kn: 8, heading_deg: 90, battery_pct: 15 }],
    ["usv-sentinel-b", { x_km: 16.6, y_km: 10.5, speed_kn: 2, heading_deg: 180 }],
    ["uuv-guardian", { x_km: 7, y_km: 10, depth_m: seafloor, speed_kn: 4, heading_deg: 90, comms_up: false }],
    ["uav-overwatch", { x_km: 17, y_km: 10, z_m: 450, speed_kn: 40, heading_deg: 60 }],
  ]));

  timeline.set(3, new Map([
    ["usv-sentinel-a", { x_km: 9, y_km: 10.2, speed_kn: 7, heading_deg: 88 }],
    ["usv-sentinel-b", { x_km: 16.8, y_km: 10.2, speed_kn: 0, heading_deg: 170 }],
    ["uuv-guardian", { x_km: 9, y_km: 10, depth_m: seafloor, speed_kn: 0, heading_deg: 90, comms_up: false }],
    ["uav-overwatch", { x_km: 17.5, y_km: 10.5, z_m: 430, speed_kn: 35, heading_deg: 70 }],
  ]));

  // Operator informed of UUV loss (link-down from tick 2 delivered); low USV battery → urgency
  timeline.set(4, new Map([
    ["usv-sentinel-a", { x_km: 11, y_km: 10, speed_kn: 7, heading_deg: 90 }],
    ["usv-sentinel-b", { x_km: 16.9, y_km: 10, speed_kn: 0, heading_deg: 160 }],
    ["uuv-guardian", { x_km: 11, y_km: 10, depth_m: seafloor, speed_kn: 0, comms_up: false }],
    ["uav-overwatch", { x_km: 17, y_km: 11, z_m: 440, speed_kn: 32, heading_deg: 80 }],
  ]));

  timeline.set(5, new Map([
    ["usv-sentinel-a", { x_km: 13, y_km: 10.1, speed_kn: 7, heading_deg: 92 }],
    ["usv-sentinel-b", { x_km: 17, y_km: 10, speed_kn: 0, heading_deg: 150 }],
    ["uuv-guardian", { x_km: 11, y_km: 10, depth_m: seafloor, speed_kn: 0, comms_up: false }],
    ["uav-overwatch", { x_km: 16.5, y_km: 10.8, z_m: 460, speed_kn: 30, heading_deg: 90 }],
  ]));

  // Subsea link restored tick 6; operator sees at tick 8 (2-hop delay)
  timeline.set(6, new Map([
    ["usv-sentinel-a", { x_km: 14.5, y_km: 10, speed_kn: 6, heading_deg: 90 }],
    ["usv-sentinel-b", { x_km: 17.1, y_km: 10.1, speed_kn: 1, heading_deg: 140 }],
    ["uuv-guardian", { x_km: 11.5, y_km: 10, depth_m: seafloor, speed_kn: 3, comms_up: true }],
    ["uav-overwatch", { x_km: 16, y_km: 11, z_m: 450, speed_kn: 28, heading_deg: 100 }],
  ]));

  timeline.set(7, new Map([
    ["usv-sentinel-a", { x_km: 15.5, y_km: 10, speed_kn: 5, heading_deg: 88 }],
    ["usv-sentinel-b", { x_km: 17, y_km: 10.2, speed_kn: 0, heading_deg: 130 }],
    ["uuv-guardian", { x_km: 12, y_km: 10, depth_m: seafloor, speed_kn: 3, comms_up: true }],
    ["uav-overwatch", { x_km: 17.2, y_km: 10.5, z_m: 435, speed_kn: 32, heading_deg: 110 }],
  ]));

  timeline.set(8, new Map([
    ["usv-sentinel-a", { x_km: 16, y_km: 10, speed_kn: 4, heading_deg: 90 }],
    ["usv-sentinel-b", { x_km: 16.8, y_km: 10, speed_kn: 0, heading_deg: 120 }],
    ["uuv-guardian", { x_km: 13, y_km: 10, depth_m: seafloor, speed_kn: 4, comms_up: true }],
    ["uav-overwatch", { x_km: 17, y_km: 10, z_m: 420, speed_kn: 35, heading_deg: 120 }],
  ]));

  return timeline;
}

/** Back-compat aliases for orchestrator imports. */
export const DEMO_ASSETS = OFFSHORE_ASSETS;
export const DEMO_SENSORS = OFFSHORE_SENSORS;
export const DEMO_MISSIONS = OFFSHORE_MISSIONS;
export const DEMO_ASSIGNMENTS = OFFSHORE_ASSIGNMENTS;
export const DEMO_COV_BASELINES = OFFSHORE_COV_BASELINES;
export const buildDemoTimeline = buildOffshoreTimeline;
