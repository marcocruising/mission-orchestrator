import { describe, it, expect } from "vitest";
import type { Asset, Belief } from "./types.js";
import type { Assignment, MissionDef } from "./stateEngine.js";
import { ingestReports } from "./ingest.js";
import {
  buildRoutePlanner,
  checkNoGoGate,
  emptyRoutePlanner,
  segmentMinDistanceKm,
  type NoGoZone,
  type ThreatZone,
} from "./routePlanner.js";
import { buildEngineInput } from "./applyPlan.js";
import { defaultPlanner } from "./planner.js";
import { defaultResolveOperatingPoint } from "./stateEngine.js";

const asset: Asset = {
  id: "usv-1",
  kind: "USV",
  domain: "surface",
  depth_rating_m: 0,
  top_speed_kn: 20,
  gps_dependent: true,
};

function beliefAt(x_km: number, y_km: number): Belief {
  return ingestReports(
    [
      { ts: 0, asset_id: "usv-1", field: "x_km", value: x_km },
      { ts: 0, asset_id: "usv-1", field: "y_km", value: y_km },
      { ts: 0, asset_id: "usv-1", field: "depth_m", value: 0 },
    ],
    new Map()
  );
}

function pointMission(target_x: number, target_y: number): MissionDef[] {
  return [
    {
      id: "m1",
      name: "Patrol",
      priority: 0.9,
      tasks: [
        {
          id: "t1",
          mission_id: "m1",
          w_t: 1,
          target_x,
          target_y,
          target_depth_m: 0,
          window_end_s: null,
          demands: [{ sensor: "eo_ir", min_quality: 0.4 }],
          constraints: [],
        },
      ],
    },
  ];
}

function assign(taskId = "t1"): Assignment[] {
  return [{ id: "a1", asset_id: "usv-1", task_id: taskId, operating_point: "SLOW", issued_ts: 0 }];
}

describe("routePlanner geometry", () => {
  it("segmentMinDistanceKm is zero when segment passes through center", () => {
    expect(segmentMinDistanceKm(0, 0, 10, 0, 5, 0)).toBeCloseTo(0, 10);
  });

  it("segmentMinDistanceKm uses endpoint distance when projection is outside segment", () => {
    expect(segmentMinDistanceKm(0, 0, 2, 0, 10, 0)).toBeCloseTo(8, 10);
  });
});

describe("buildRoutePlanner (D3)", () => {
  it("empty planner returns zero exposure and risk", () => {
    const result = emptyRoutePlanner.measure({
      assignments: assign(),
      missions: pointMission(10, 0),
      belief: beliefAt(0, 0),
      assets: [asset],
    });
    expect(result.exposure).toBe(0);
    expect(result.risk).toBe(0);
  });

  it("threat on direct path yields nonzero exposure and risk", () => {
    const threats: ThreatZone[] = [{ id: "t1", x_km: 5, y_km: 0, radius_km: 2, intensity: 0.8 }];
    const planner = buildRoutePlanner(threats, []);
    const result = planner.measure({
      assignments: assign(),
      missions: pointMission(10, 0),
      belief: beliefAt(0, 0),
      assets: [asset],
    });
    expect(result.exposure).toBeGreaterThan(0);
    expect(result.risk).toBeGreaterThan(0);
  });

  it("threat far from path yields zero exposure and risk", () => {
    const threats: ThreatZone[] = [{ id: "t1", x_km: 5, y_km: 20, radius_km: 1, intensity: 0.9 }];
    const planner = buildRoutePlanner(threats, []);
    const result = planner.measure({
      assignments: assign(),
      missions: pointMission(10, 0),
      belief: beliefAt(0, 0),
      assets: [asset],
    });
    expect(result.exposure).toBe(0);
    expect(result.risk).toBe(0);
  });

  it("higher threat intensity increases risk monotonically", () => {
    const low = buildRoutePlanner(
      [{ id: "t1", x_km: 5, y_km: 0, radius_km: 3, intensity: 0.3 }],
      []
    );
    const high = buildRoutePlanner(
      [{ id: "t1", x_km: 5, y_km: 0, radius_km: 3, intensity: 0.9 }],
      []
    );
    const ctx = {
      assignments: assign(),
      missions: pointMission(10, 0),
      belief: beliefAt(0, 0),
      assets: [asset],
    };
    expect(high.measure(ctx).risk).toBeGreaterThan(low.measure(ctx).risk);
  });

  it("closer threat center increases exposure monotonically", () => {
    const near = buildRoutePlanner(
      [{ id: "t1", x_km: 5, y_km: 0, radius_km: 3, intensity: 0.7 }],
      []
    );
    const far = buildRoutePlanner(
      [{ id: "t1", x_km: 5, y_km: 2, radius_km: 3, intensity: 0.7 }],
      []
    );
    const ctx = {
      assignments: assign(),
      missions: pointMission(10, 0),
      belief: beliefAt(0, 0),
      assets: [asset],
    };
    expect(near.measure(ctx).exposure).toBeGreaterThan(far.measure(ctx).exposure);
  });

  it("no_go on path fails gate", () => {
    const noGos: NoGoZone[] = [{ id: "ng1", x_km: 5, y_km: 0, radius_km: 1 }];
    expect(
      checkNoGoGate({
        assignments: assign(),
        missions: pointMission(10, 0),
        belief: beliefAt(0, 0),
        assets: [asset],
        noGos,
      })
    ).toBe(false);
  });

  it("no_go off path passes gate", () => {
    const noGos: NoGoZone[] = [{ id: "ng1", x_km: 5, y_km: 10, radius_km: 0.5 }];
    expect(
      checkNoGoGate({
        assignments: assign(),
        missions: pointMission(10, 0),
        belief: beliefAt(0, 0),
        assets: [asset],
        noGos,
      })
    ).toBe(true);
  });

  it("planner prunes reassignment through no-go zone", () => {
    const noGos: NoGoZone[] = [{ id: "ng1", x_km: 5, y_km: 0, radius_km: 1 }];
    const threats: ThreatZone[] = [];
    const spare: Asset = {
      id: "usv-2",
      kind: "USV",
      domain: "surface",
      depth_rating_m: 0,
      top_speed_kn: 20,
      gps_dependent: true,
    };
    const belief = ingestReports(
      [
        { ts: 0, asset_id: "usv-1", field: "x_km", value: 8 },
        { ts: 0, asset_id: "usv-1", field: "y_km", value: 0 },
        { ts: 0, asset_id: "usv-2", field: "x_km", value: 0 },
        { ts: 0, asset_id: "usv-2", field: "y_km", value: 0 },
      ],
      new Map()
    );
    const missions = pointMission(10, 0);
    const input = buildEngineInput({
      belief,
      assets: [asset, spare],
      sensors: [
        { asset_id: "usv-1", sensor: "eo_ir", base_quality: 0.9, max_range_km: 12, k_motion: 0.36 },
        { asset_id: "usv-2", sensor: "eo_ir", base_quality: 0.9, max_range_km: 12, k_motion: 0.36 },
      ],
      missions,
      assignments: [{ id: "a1", asset_id: "usv-1", task_id: "t1", operating_point: "SLOW", issued_ts: 0 }],
      now: 0,
      covBaselines: new Map([["m1", 0.9]]),
      resolveOperatingPoint: defaultResolveOperatingPoint,
      routePlanner: buildRoutePlanner(threats, noGos),
    });
    const evals = defaultPlanner.replan({
      input,
      affectedMissionIds: ["m1"],
      baselineCov: { m1: 0.85 },
    });
    const blocked = evals.find((e) => e.plan_id === "reassign-usv-2-t1");
    expect(blocked).toBeUndefined();
    expect(evals.find((e) => e.plan_id === "do-nothing")).toBeDefined();
  });
});
