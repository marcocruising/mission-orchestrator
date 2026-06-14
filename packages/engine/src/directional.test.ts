import { describe, it, expect } from "vitest";
import { effectiveQuality } from "./coverage.js";
import { checkPointingGate } from "./pointingGate.js";
import { buildEngineInput } from "./applyPlan.js";
import { defaultResolveOperatingPoint } from "./stateEngine.js";
import { ingestReports } from "./ingest.js";
import type { Asset, AssetSensor, Belief, MissionDef } from "./types.js";
import { generateCandidates } from "./planner.js";
import { recomputeMissionStatesWithVisits } from "./stateEngine.js";
import { formatPatrolHandle, patrolSweepCellCandidates } from "./volume/patrolSweep.js";
import { planningOverridesForAssignments } from "./volume/patrolSweep.js";

describe("C2 directional sensors", () => {
  const directionalSensor: AssetSensor = {
    asset_id: "uuv-1",
    sensor: "active_sonar",
    base_quality: 0.9,
    max_range_km: 10,
    k_motion: 0.29,
    beam_half_angle_deg: 30,
  };

  it("target outside beam yields near-zero quality", () => {
    const q = effectiveQuality(
      {
        sensor: "active_sonar",
        base_quality: 0.9,
        max_range_km: 10,
        k_motion: 0.29,
        beam_half_angle_deg: 30,
      },
      { target_x: 0, target_y: 1, target_depth_m: 50 },
      {
        asset_id: "uuv-1",
        x_km: 0,
        y_km: 0,
        depth_m: 50,
        speed_kn: 2,
        top_speed_kn: 8,
        bearing_deg: 0,
        elevation_deg: 0,
      }
    );
    expect(q).toBeLessThan(0.05);
  });

  it("target inside beam retains meaningful quality", () => {
    const q = effectiveQuality(
      {
        sensor: "active_sonar",
        base_quality: 0.9,
        max_range_km: 10,
        k_motion: 0.29,
        beam_half_angle_deg: 30,
      },
      { target_x: 1, target_y: 0, target_depth_m: 50 },
      {
        asset_id: "uuv-1",
        x_km: 0,
        y_km: 0,
        depth_m: 50,
        speed_kn: 2,
        top_speed_kn: 8,
        bearing_deg: 0,
        elevation_deg: 0,
      }
    );
    expect(q).toBeGreaterThan(0.3);
  });

  it("omnidirectional sensors ignore beam (backward compatible)", () => {
    const q = effectiveQuality(
      {
        sensor: "passive_acoustic",
        base_quality: 0.9,
        max_range_km: 10,
        k_motion: 1.6,
      },
      { target_x: 0, target_y: 5, target_depth_m: 50 },
      {
        asset_id: "uuv-1",
        x_km: 0,
        y_km: 0,
        depth_m: 50,
        speed_kn: 2,
        top_speed_kn: 8,
        bearing_deg: 0,
      }
    );
    expect(q).toBeGreaterThan(0.2);
  });

  it("checkPointingGate rejects conflicting bearings on one directional sensor", () => {
    const assets: Asset[] = [
      { id: "uuv-1", kind: "UUV", domain: "subsurface", depth_rating_m: 300, top_speed_kn: 8, gps_dependent: false },
    ];
    const missions: MissionDef[] = [
      {
        id: "m1",
        name: "A",
        priority: 1,
        tasks: [
          {
            id: "t-a",
            mission_id: "m1",
            w_t: 1,
            target_x: 2,
            target_y: 0,
            target_depth_m: 50,
            window_end_s: null,
            demands: [{ sensor: "active_sonar", min_quality: 0.5 }],
            constraints: [],
          },
          {
            id: "t-b",
            mission_id: "m1",
            w_t: 1,
            target_x: 0,
            target_y: 2,
            target_depth_m: 50,
            window_end_s: null,
            demands: [{ sensor: "active_sonar", min_quality: 0.5 }],
            constraints: [],
          },
        ],
      },
    ];
    let belief: Belief = new Map();
    belief = ingestReports(
      [
        { ts: 100, asset_id: "uuv-1", field: "x_km", value: 0 },
        { ts: 100, asset_id: "uuv-1", field: "y_km", value: 0 },
        { ts: 100, asset_id: "uuv-1", field: "depth_m", value: 50 },
      ],
      belief
    );

    const ok = checkPointingGate(
      [
        { id: "a1", asset_id: "uuv-1", task_id: "t-a", operating_point: '{"bearing":0}', issued_ts: 0 },
        { id: "a2", asset_id: "uuv-1", task_id: "t-b", operating_point: '{"bearing":90}', issued_ts: 0 },
      ],
      missions,
      [directionalSensor],
      belief,
      assets,
      defaultResolveOperatingPoint
    );
    expect(ok).toBe(false);
  });
});

describe("C1b planner patrol sweep", () => {
  it("patrol sandbox improves AREA coverage vs do-nothing when vehicle is outside volume", () => {
    let belief: Belief = new Map();
    belief = ingestReports(
      [
        { ts: 100, asset_id: "uuv-1", field: "x_km", value: 0 },
        { ts: 100, asset_id: "uuv-1", field: "y_km", value: 0 },
        { ts: 100, asset_id: "uuv-1", field: "depth_m", value: 50 },
      ],
      belief
    );

    const assets: Asset[] = [
      { id: "uuv-1", kind: "UUV", domain: "subsurface", depth_rating_m: 300, top_speed_kn: 8, gps_dependent: false },
    ];
    const sensors: AssetSensor[] = [
      { asset_id: "uuv-1", sensor: "passive_acoustic", base_quality: 0.9, max_range_km: 10, k_motion: 1.6 },
    ];
    const missions: MissionDef[] = [
      {
        id: "m-area",
        name: "Patrol",
        priority: 1,
        tasks: [
          {
            id: "t-area",
            mission_id: "m-area",
            w_t: 1,
            kind: "AREA",
            target_x: 2,
            target_y: 0,
            target_depth_m: 50,
            window_end_s: null,
            demands: [{ sensor: "passive_acoustic", min_quality: 0.5 }],
            constraints: [],
            area: {
              footprint: {
                kind: "aabb",
                center: { x_m: 2000, y_m: 0 },
                half_extent_m: { x: 500, y: 500 },
              },
              z_min_m: -60,
              z_max_m: -40,
              revisit_interval_s: 600,
              cell_size_m: 500,
            },
          },
        ],
      },
    ];

    const input = buildEngineInput({
      belief,
      assets,
      sensors,
      missions,
      assignments: [{ id: "a1", asset_id: "uuv-1", task_id: "t-area", operating_point: "SLOW", issued_ts: 0 }],
      now: 200,
      covBaselines: new Map([["m-area", 0.9]]),
      resolveOperatingPoint: defaultResolveOperatingPoint,
      volumeVisits: new Map(),
    });

    const baseline = recomputeMissionStatesWithVisits(input, 200).states[0]!.cov_now;
    const task = missions[0]!.tasks[0]!;
    const cellId = patrolSweepCellCandidates(input, task, 1)[0]!;
    const patrolAssignments = [
      { id: "a1", asset_id: "uuv-1", task_id: "t-area", operating_point: formatPatrolHandle(cellId), issued_ts: 0 },
    ];
    const overrides = planningOverridesForAssignments(input, patrolAssignments);
    const sandbox = recomputeMissionStatesWithVisits(
      { ...input, assignments: patrolAssignments, planningOverrides: overrides },
      200
    ).states[0]!.cov_now;

    expect(sandbox).toBeGreaterThan(baseline);

    const evals = generateCandidates(input, ["m-area"], { "m-area": baseline });
    const patrolEval = evals.find((e) => e.plan_id.startsWith("patrol-"));
    expect(patrolEval).toBeDefined();
    expect(patrolEval!.cov_by_mission["m-area"]).toBeGreaterThanOrEqual(baseline);
  });
});
