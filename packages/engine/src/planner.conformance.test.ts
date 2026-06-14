import { describe, it, expect } from "vitest";
import type { Planner, PlannerRequest } from "./planner.js";
import { defaultPlanner, stubPlanner } from "./planner.js";
import { buildEngineInput } from "./applyPlan.js";
import { defaultResolveOperatingPoint } from "./stateEngine.js";
import type { Asset, AssetSensor, Belief, MissionDef } from "./types.js";
import { ingestReports } from "./ingest.js";

function conformanceFixture(): PlannerRequest {
  const assets: Asset[] = [
    { id: "uuv-1", kind: "UUV", domain: "subsurface", depth_rating_m: 300, top_speed_kn: 8, gps_dependent: false },
  ];
  const sensors: AssetSensor[] = [
    { asset_id: "uuv-1", sensor: "passive_acoustic", base_quality: 0.9, max_range_km: 10, k_motion: 1.6 },
  ];
  const missions: MissionDef[] = [
    {
      id: "m1",
      name: "Track",
      priority: 0.9,
      tasks: [
        {
          id: "t1",
          mission_id: "m1",
          w_t: 1,
          target_x: 2,
          target_y: 0,
          target_depth_m: 50,
          window_end_s: 400,
          demands: [{ sensor: "passive_acoustic", min_quality: 0.5 }],
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
      { ts: 100, asset_id: "uuv-1", field: "speed_kn", value: 6 },
    ],
    belief
  );

  const input = buildEngineInput({
    belief,
    assets,
    sensors,
    missions,
    assignments: [{ id: "a1", asset_id: "uuv-1", task_id: "t1", operating_point: "FAST", issued_ts: 0 }],
    now: 200,
    covBaselines: new Map([["m1", 0.9]]),
    resolveOperatingPoint: defaultResolveOperatingPoint,
  });

  return {
    input,
    affectedMissionIds: ["m1"],
    baselineCov: { m1: 0.85 },
  };
}

/** Shared conformance contract — any Planner body must satisfy this. */
function assertPlannerConformance(planner: Planner, request: PlannerRequest): void {
  const first = planner.replan(request);
  const second = planner.replan(request);

  expect(first.length).toBeGreaterThan(0);
  expect(second).toEqual(first);

  const doNothing = first.find((e) => e.plan_id === "do-nothing");
  expect(doNothing).toBeDefined();
  expect(doNothing!.n_moves).toBe(0);

  for (let i = 1; i < first.length; i++) {
    expect(first[i - 1]!.objective).toBeGreaterThanOrEqual(first[i]!.objective);
  }

  for (const evalRow of first) {
    expect(evalRow.plan_id.length).toBeGreaterThan(0);
    expect(Number.isFinite(evalRow.objective)).toBe(true);
    expect(evalRow.cov_by_mission.m1).toBeGreaterThanOrEqual(0);
    expect(evalRow.cov_by_mission.m1).toBeLessThanOrEqual(1);
  }
}

describe("Planner conformance (A0.5)", () => {
  it("defaultPlanner passes conformance", () => {
    assertPlannerConformance(defaultPlanner, conformanceFixture());
  });

  it("stubPlanner passes conformance", () => {
    assertPlannerConformance(stubPlanner, conformanceFixture());
  });

  it("defaultPlanner returns more candidates than stubPlanner", () => {
    const request = conformanceFixture();
    const full = defaultPlanner.replan(request);
    const stub = stubPlanner.replan(request);
    expect(full.length).toBeGreaterThan(stub.length);
    expect(stub).toHaveLength(1);
    expect(stub[0]!.plan_id).toBe("do-nothing");
  });

  it("stubPlanner do-nothing objective matches defaultPlanner do-nothing", () => {
    const request = conformanceFixture();
    const fullDoNothing = defaultPlanner.replan(request).find((e) => e.plan_id === "do-nothing");
    const stubDoNothing = stubPlanner.replan(request)[0];
    expect(stubDoNothing!.objective).toBeCloseTo(fullDoNothing!.objective, 10);
    expect(stubDoNothing!.cov_by_mission.m1).toBeCloseTo(fullDoNothing!.cov_by_mission.m1, 10);
  });
});
