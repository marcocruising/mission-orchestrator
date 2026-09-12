import { cellCentersKm, type AssetRow, type AssetSensorRow, type AssignmentRow, type AlertRow, type BeliefFact, type CandidatePlanRow, type MissionRow, type MissionStateRow, type PlanEvalRow, type TaskRow, type VolumeVisitRow } from "./lib.js";

/** Query param used to render a captured tick-4 console without a live database. */
export function isDemoMode(): boolean {
  return new URLSearchParams(window.location.search).has("demo");
}

const PIPELINE_FOOTPRINT = {
  kind: "aabb",
  center_x_km: 9,
  center_y_km: 10,
  half_width_km: 7,
  half_height_km: 0.75,
};

const NOW = 900;
const UUV_LAST = 0;

function factsFor(
  assetId: string,
  ts: number,
  fields: Record<string, unknown>
): BeliefFact[] {
  return Object.entries(fields).map(([field, value]) => ({
    asset_id: assetId,
    field,
    value,
    ts,
  }));
}

export const DEMO_TICK_LABELS = [
  { tick: 0, label: "Fleet on station — patrol begins" },
  { tick: 1, label: "USV-A + UUV sweep east along pipeline" },
  { tick: 2, label: "Volume cells start turning green" },
  { tick: 3, label: "UUV link fails subsea (operator not yet aware)" },
  { tick: 4, label: "Delayed link-down arrives — search ellipse blooms" },
  { tick: 5, label: "Pipeline confidence drops — alerts expected" },
  { tick: 6, label: "UUV still dark; USV continues alone" },
  { tick: 7, label: "Subsea link restored (operator learns next tick)" },
  { tick: 8, label: "UUV back on net — full patrol resumes" },
];

export const DEMO_ASSETS: AssetRow[] = [
  { id: "usv-sentinel-a", kind: "USV", domain: "surface", top_speed_kn: 22 },
  { id: "usv-sentinel-b", kind: "USV", domain: "surface", top_speed_kn: 22 },
  { id: "uuv-guardian", kind: "UUV", domain: "subsurface", top_speed_kn: 6 },
  { id: "uav-overwatch", kind: "UAV", domain: "air", top_speed_kn: 45 },
];

export const DEMO_MISSION_DEFS: MissionRow[] = [
  { id: "mission-rig-guard", name: "Oil rig protection" },
  { id: "mission-pipeline-guard", name: "Pipeline guard" },
];

export const DEMO_MISSIONS: MissionStateRow[] = [
  {
    mission_id: "mission-rig-guard",
    tick: 4,
    cov_baseline: 0.9,
    cov_now: 0.88,
    tier: "FULL",
    confidence: 0.91,
    salience: 0.02,
  },
  {
    mission_id: "mission-pipeline-guard",
    tick: 4,
    cov_baseline: 0.85,
    cov_now: 0.41,
    tier: "AT_RISK",
    confidence: 0.34,
    salience: 0.52,
  },
];

export const DEMO_TASKS: TaskRow[] = [
  {
    id: "task-rig-watch",
    mission_id: "mission-rig-guard",
    kind: "POINT",
    target_x: 17,
    target_y: 10,
    target_depth_m: 0,
    footprint: null,
    z_min_m: null,
    z_max_m: null,
    cell_size_m: null,
  },
  {
    id: "task-rig-air",
    mission_id: "mission-rig-guard",
    kind: "POINT",
    target_x: 17,
    target_y: 10,
    target_depth_m: 0,
    footprint: null,
    z_min_m: null,
    z_max_m: null,
    cell_size_m: null,
  },
  {
    id: "task-pipeline-surface",
    mission_id: "mission-pipeline-guard",
    kind: "AREA",
    target_x: 9,
    target_y: 10,
    target_depth_m: 0,
    footprint: PIPELINE_FOOTPRINT,
    z_min_m: -2,
    z_max_m: 2,
    cell_size_m: 2000,
  },
  {
    id: "task-pipeline-subsea",
    mission_id: "mission-pipeline-guard",
    kind: "AREA",
    target_x: 9,
    target_y: 10,
    target_depth_m: 60,
    footprint: PIPELINE_FOOTPRINT,
    z_min_m: -65,
    z_max_m: -55,
    cell_size_m: 2000,
  },
];

const surfaceTask = DEMO_TASKS.find((t) => t.id === "task-pipeline-surface")!;
const subseaTask = DEMO_TASKS.find((t) => t.id === "task-pipeline-subsea")!;

export const DEMO_VISITS: VolumeVisitRow[] = [
  ...cellCentersKm(surfaceTask)
    .filter((c) => c.x_km <= 11)
    .map((c) => ({ task_id: "task-pipeline-surface", cell_id: c.cell_id, peak_quality: 0.72 })),
  ...cellCentersKm(subseaTask)
    .filter((c) => c.x_km <= 9)
    .map((c) => ({ task_id: "task-pipeline-subsea", cell_id: c.cell_id, peak_quality: 0.8 })),
];

export const DEMO_FACTS: BeliefFact[] = [
  ...factsFor("usv-sentinel-a", NOW, {
    x_km: 11,
    y_km: 10,
    depth_m: 0,
    speed_kn: 7,
    heading_deg: 90,
    battery_pct: 82,
    comms_up: true,
    health: "ok",
  }),
  ...factsFor("usv-sentinel-b", NOW, {
    x_km: 16.9,
    y_km: 10,
    depth_m: 0,
    speed_kn: 0,
    heading_deg: 160,
    battery_pct: 88,
    comms_up: true,
    health: "ok",
  }),
  ...factsFor("uuv-guardian", UUV_LAST, {
    x_km: 11,
    y_km: 10,
    depth_m: 60,
    speed_kn: 0,
    heading_deg: 90,
    battery_pct: 71,
    comms_up: false,
    health: "ok",
  }),
  ...factsFor("uav-overwatch", NOW, {
    x_km: 17,
    y_km: 11,
    z_m: 440,
    speed_kn: 32,
    heading_deg: 80,
    battery_pct: 64,
    comms_up: true,
    health: "ok",
  }),
];

export const DEMO_SENSORS: AssetSensorRow[] = [
  { asset_id: "usv-sentinel-a", sensor: "eo_ir", base_quality: 0.88, max_range_km: 12, k_motion: 0.36, beam_half_angle_deg: null },
  { asset_id: "usv-sentinel-a", sensor: "passive_acoustic", base_quality: 0.72, max_range_km: 8, k_motion: 1.6, beam_half_angle_deg: null },
  { asset_id: "usv-sentinel-b", sensor: "eo_ir", base_quality: 0.9, max_range_km: 14, k_motion: 0.36, beam_half_angle_deg: null },
  { asset_id: "usv-sentinel-b", sensor: "passive_acoustic", base_quality: 0.75, max_range_km: 9, k_motion: 1.6, beam_half_angle_deg: null },
  { asset_id: "uuv-guardian", sensor: "passive_acoustic", base_quality: 0.92, max_range_km: 10, k_motion: 1.6, beam_half_angle_deg: null },
  { asset_id: "uuv-guardian", sensor: "active_sonar", base_quality: 0.85, max_range_km: 8, k_motion: 0.29, beam_half_angle_deg: 35 },
  { asset_id: "uav-overwatch", sensor: "eo_ir", base_quality: 0.93, max_range_km: 18, k_motion: 0.25, beam_half_angle_deg: null },
];

export const DEMO_ASSIGNMENTS: AssignmentRow[] = [
  { asset_id: "usv-sentinel-a", task_id: "task-pipeline-surface", operating_point: "SLOW" },
  { asset_id: "usv-sentinel-b", task_id: "task-rig-watch", operating_point: "STATION" },
  { asset_id: "uuv-guardian", task_id: "task-pipeline-subsea", operating_point: '{"bearing":90,"speed":"SLOW"}' },
  { asset_id: "uav-overwatch", task_id: "task-rig-air", operating_point: "FAST" },
];

export const DEMO_ALERTS: AlertRow[] = [
  {
    ts: NOW,
    mission_id: "mission-pipeline-guard",
    salience: 0.52,
    tier_change: "FULL → AT_RISK",
    summary_text:
      "**UUV-Guardian** dropped off the acoustic relay. Pipeline seafloor patrol is uncovered; search ellipse is growing along the corridor.",
    shown: true,
  },
];

export const DEMO_CANDIDATES: CandidatePlanRow[] = [
  {
    plan_id: "plan-reassign-usv-b",
    n_moves: 1,
    moves: [
      {
        kind: "reassign",
        asset_id: "usv-sentinel-b",
        task_id: "task-pipeline-surface",
        operating_point: "SLOW",
      },
    ],
  },
  {
    plan_id: "plan-slow-usv-a",
    n_moves: 1,
    moves: [
      { kind: "set_operating_point", asset_id: "usv-sentinel-a", operating_point: "STATION" },
    ],
  },
  {
    plan_id: "plan-hold",
    n_moves: 0,
    moves: [],
  },
];

export const DEMO_PLANS: PlanEvalRow[] = [
  {
    plan_id: "plan-reassign-usv-b",
    objective: 1.42,
    cov_by_mission: {
      "mission-pipeline-guard": 0.71,
      "mission-rig-guard": 0.62,
    },
    cascades: [{ mission_id: "mission-rig-guard", delta: -0.26 }],
    assumptions: [
      "USV-B reaches the corridor in 9 min",
      "UUV remains silent through the search window",
    ],
  },
  {
    plan_id: "plan-slow-usv-a",
    objective: 1.18,
    cov_by_mission: {
      "mission-pipeline-guard": 0.48,
      "mission-rig-guard": 0.88,
    },
    cascades: [],
    assumptions: ["Slowing USV-A restores passive acoustic quality on the surface leg"],
  },
  {
    plan_id: "plan-hold",
    objective: 1.05,
    cov_by_mission: {
      "mission-pipeline-guard": 0.41,
      "mission-rig-guard": 0.88,
    },
    cascades: [],
    assumptions: ["Do-nothing baseline — UUV may regain the acoustic gateway"],
  },
];
