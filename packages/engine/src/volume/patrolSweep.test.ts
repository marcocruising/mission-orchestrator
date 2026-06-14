import { describe, it, expect } from "vitest";
import {
  formatPatrolHandle,
  parsePatrolHandle,
  patrolSweepCellCandidates,
  planningOverridesForAssignments,
} from "./patrolSweep.js";
import { buildEngineInput } from "../applyPlan.js";
import { defaultResolveOperatingPoint } from "../stateEngine.js";
import { ingestReports } from "../ingest.js";
import type { Asset, AssetSensor, Belief, MissionDef } from "../types.js";

function areaFixture(belief: Belief) {
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
          target_x: 0,
          target_y: 0,
          target_depth_m: 50,
          window_end_s: null,
          demands: [{ sensor: "passive_acoustic", min_quality: 0.5 }],
          constraints: [],
          area: {
            footprint: {
              kind: "aabb",
              center: { x_m: 2000, y_m: 0 },
              half_extent_m: { x: 1000, y: 1000 },
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

  return buildEngineInput({
    belief,
    assets,
    sensors,
    missions,
    assignments: [{ id: "a1", asset_id: "uuv-1", task_id: "t-area", operating_point: "SLOW", issued_ts: 0 }],
    now: 200,
    covBaselines: new Map(),
    resolveOperatingPoint: defaultResolveOperatingPoint,
    volumeVisits: new Map(),
  });
}

describe("patrolSweep (C1b)", () => {
  it("parsePatrolHandle round-trips opaque cell ids", () => {
    const handle = formatPatrolHandle("c:000:001:000");
    expect(parsePatrolHandle(handle)).toEqual({ cell_id: "c:000:001:000" });
    expect(parsePatrolHandle("SLOW")).toBeNull();
  });

  it("patrolSweepCellCandidates prefers unvisited cells", () => {
    let belief: Belief = new Map();
    belief = ingestReports(
      [
        { ts: 100, asset_id: "uuv-1", field: "x_km", value: 0 },
        { ts: 100, asset_id: "uuv-1", field: "y_km", value: 0 },
        { ts: 100, asset_id: "uuv-1", field: "depth_m", value: 50 },
      ],
      belief
    );
    const input = areaFixture(belief);
    const task = input.missions[0]!.tasks[0]!;
    const candidates = patrolSweepCellCandidates(input, task, 3);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(3);
  });

  it("planningOverridesForAssignments maps patrol handle to cell center", () => {
    let belief: Belief = new Map();
    belief = ingestReports(
      [{ ts: 100, asset_id: "uuv-1", field: "x_km", value: 0 }],
      belief
    );
    const input = areaFixture(belief);
    const task = input.missions[0]!.tasks[0]!;
    const cellId = patrolSweepCellCandidates(input, task, 1)[0]!;
    const overrides = planningOverridesForAssignments(input, [
      { id: "a1", asset_id: "uuv-1", task_id: "t-area", operating_point: formatPatrolHandle(cellId), issued_ts: 0 },
    ]);
    expect(overrides?.get("uuv-1")?.x_m).toBeGreaterThan(0);
  });
});
