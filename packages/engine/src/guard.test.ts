import { describe, it, expect } from "vitest";
import {
  computeMissionCoverage,
  computeTaskLeaf,
  recomputeMissionStates,
  defaultResolveOperatingPoint,
  type MissionDef,
  type TaskDef,
} from "./stateEngine.js";
import { tier, coverageMission, slantRangeKm } from "./coverage.js";
import { buildEngineInput } from "./applyPlan.js";
import { defaultPlanner } from "./planner.js";
import {
  envMult,
  motionEnvFactor,
  DEFAULT_ENV_FACTORS,
  salinityFactor,
  type EnvMultContext,
} from "./envMult.js";
import type { Asset, AssetSensor, Belief } from "./types.js";
import { ingestReports } from "./ingest.js";

function baseInput(overrides: {
  missions: MissionDef[];
  assignments?: ReturnType<typeof buildEngineInput>["assignments"];
}) {
  const assets: Asset[] = [
    { id: "uuv-1", kind: "UUV", domain: "subsurface", depth_rating_m: 300, top_speed_kn: 8, gps_dependent: false },
  ];
  const sensors: AssetSensor[] = [
    { asset_id: "uuv-1", sensor: "passive_acoustic", base_quality: 0.9, max_range_km: 10, k_motion: 1.6 },
  ];
  let belief: Belief = new Map();
  belief = ingestReports(
    [
      { ts: 100, asset_id: "uuv-1", field: "x_km", value: 0, confidence: 1, half_life_s: 120 },
      { ts: 100, asset_id: "uuv-1", field: "y_km", value: 0 },
      { ts: 100, asset_id: "uuv-1", field: "depth_m", value: 50 },
      { ts: 100, asset_id: "uuv-1", field: "speed_kn", value: 2 },
    ],
    belief
  );

  return buildEngineInput({
    belief,
    assets,
    sensors,
    missions: overrides.missions,
    assignments:
      overrides.assignments ?? [
        { id: "a1", asset_id: "uuv-1", task_id: "t-point", operating_point: "SLOW", issued_ts: 0 },
      ],
    now: 200,
    covBaselines: new Map([["m-mix", 0.9]]),
    resolveOperatingPoint: defaultResolveOperatingPoint,
  });
}

describe("B1 rollup-is-leaf-agnostic guard (T3.1 prerequisite)", () => {
  const pointTask: TaskDef = {
    id: "t-point",
    mission_id: "m-mix",
    w_t: 1,
    kind: "POINT",
    target_x: 2,
    target_y: 0,
    target_depth_m: 50,
    window_end_s: null,
    demands: [{ sensor: "passive_acoustic", min_quality: 0.5 }],
    constraints: [],
  };

  const areaStubTask: TaskDef = {
    id: "t-area",
    mission_id: "m-mix",
    w_t: 1,
    kind: "AREA",
    target_x: 9999,
    target_y: 9999,
    target_depth_m: 9999,
    window_end_s: null,
    demands: [],
    constraints: [],
  };

  const mixedMission: MissionDef = {
    id: "m-mix",
    name: "Mixed",
    priority: 0.8,
    tasks: [pointTask, areaStubTask],
  };

  it("AREA stub leaf returns constant cov_t=0.7 regardless of bogus target", () => {
    const input = baseInput({ missions: [mixedMission] });
    const leaf = computeTaskLeaf(areaStubTask, input.assignments, input);
    expect(leaf.infeasible).toBe(false);
    expect(leaf.cov_t).toBe(0.7);
  });

  it("mission rollup weights point + area leaves without reading point-only fields", () => {
    const input = baseInput({ missions: [mixedMission] });
    const pointLeaf = computeTaskLeaf(pointTask, input.assignments, input);
    const { cov_m, confidence } = computeMissionCoverage(mixedMission, input.assignments, input);

    const expectedCovM = coverageMission([
      { w_t: pointTask.w_t, cov_t: pointLeaf.cov_t },
      { w_t: areaStubTask.w_t, cov_t: 0.7 },
    ]);
    expect(cov_m).toBeCloseTo(expectedCovM, 10);
    expect(confidence).toBeGreaterThan(0);
    expect(tier(cov_m)).toBe(tier(expectedCovM));
  });

  it("recomputeMissionStates tier matches mixed leaf rollup", () => {
    const input = baseInput({ missions: [mixedMission] });
    const [state] = recomputeMissionStates(input, 1);
    const { cov_m } = computeMissionCoverage(mixedMission, input.assignments, input);
    expect(state!.cov_now).toBeCloseTo(cov_m, 10);
    expect(state!.tier).toBe(tier(cov_m));
  });

  it("unknown task kind is infeasible", () => {
    const input = baseInput({ missions: [mixedMission] });
    const unknown = { ...pointTask, kind: "VOLUME" as TaskDef["kind"] };
    const leaf = computeTaskLeaf(unknown, input.assignments, input);
    expect(leaf.infeasible).toBe(true);
    expect(leaf.cov_t).toBe(0);
  });

  it("POINT leaf golden fixture — default kind matches closed-form pre-refactor formula", () => {
    const input = baseInput({
      missions: [
        {
          id: "m-golden",
          name: "Golden",
          priority: 1,
          tasks: [
            {
              id: "t-golden",
              mission_id: "m-golden",
              w_t: 1,
              target_x: 2,
              target_y: 0,
              target_depth_m: 50,
              window_end_s: null,
              demands: [{ sensor: "passive_acoustic", min_quality: 0.95 }],
              constraints: [],
            },
          ],
        },
      ],
      assignments: [
        {
          id: "a1",
          asset_id: "uuv-1",
          task_id: "t-golden",
          operating_point: "STATION",
          issued_ts: 0,
        },
      ],
    });
    const task = input.missions[0]!.tasks[0]!;
    const vehicle = {
      asset_id: "uuv-1",
      x_km: 0,
      y_km: 0,
      depth_m: 50,
      speed_kn: 2,
      top_speed_kn: 8,
    };
    const target = {
      target_x: task.target_x,
      target_y: task.target_y,
      target_depth_m: task.target_depth_m,
    };
    const sensor = {
      sensor: "passive_acoustic",
      base_quality: 0.9,
      max_range_km: 10,
      k_motion: 1.6,
    };

    const R = slantRangeKm(vehicle, target);
    const rangeMult = Math.pow(1 - R / sensor.max_range_km, input.config.p);
    const motionMult = Math.exp(-sensor.k_motion * (0 / vehicle.top_speed_kn));
    const expectedQ = sensor.base_quality * rangeMult * motionMult;
    const expectedSat = Math.min(expectedQ / task.demands[0]!.min_quality, 1);
    const expectedCovT = expectedSat;

    const leaf = computeTaskLeaf(task, input.assignments, input);
    expect(leaf.infeasible).toBe(false);
    expect(leaf.cov_t).toBeCloseTo(expectedCovT, 10);
    expect(leaf.cov_t).toBeCloseTo(0.8473, 3);

    const { cov_m } = computeMissionCoverage(input.missions[0]!, input.assignments, input);
    expect(cov_m).toBeCloseTo(expectedCovT, 10);
  });
});

describe("B2 envMult extensibility guard (T3.2 partial)", () => {
  const ctx: EnvMultContext = {
    sensor: { sensor: "passive_acoustic", base_quality: 0.9, max_range_km: 10, k_motion: 1.6 },
    vehicle: { asset_id: "v1", x_km: 0, y_km: 0, depth_m: 50, speed_kn: 4, top_speed_kn: 8 },
  };

  it("salinity stub (third registry factor) is a no-op on the product", () => {
    const motionOnly = envMult([motionEnvFactor], ctx);
    const withRegistry = envMult(DEFAULT_ENV_FACTORS, ctx);
    expect(withRegistry).toBeCloseTo(motionOnly, 12);
  });

  it("salinityFactor stub returns 1.0 in isolation", () => {
    expect(salinityFactor(ctx)).toBe(1);
  });
});

describe("B3 opaque operating-point guard (T3.2 partial)", () => {
  const mission: MissionDef = {
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
  };

  it("JSON bearing handle and enum SLOW both produce finite coverage via resolver", () => {
    const slowInput = baseInput({
      missions: [mission],
      assignments: [{ id: "a1", asset_id: "uuv-1", task_id: "t1", operating_point: "SLOW", issued_ts: 0 }],
    });
    const bearingInput = baseInput({
      missions: [mission],
      assignments: [
        {
          id: "a1",
          asset_id: "uuv-1",
          task_id: "t1",
          operating_point: JSON.stringify({ bearing: 45 }),
          issued_ts: 0,
        },
      ],
    });

    const slowCov = recomputeMissionStates(slowInput, 1)[0]!.cov_now;
    const bearingCov = recomputeMissionStates(bearingInput, 1)[0]!.cov_now;
    expect(slowCov).toBeGreaterThan(0);
    expect(bearingCov).toBeGreaterThan(0);
    expect(Number.isFinite(slowCov)).toBe(true);
    expect(Number.isFinite(bearingCov)).toBe(true);
  });

  it("planner ranks candidates without introspecting operating_point handle shape", () => {
    const input = baseInput({
      missions: [mission],
      assignments: [
        {
          id: "a1",
          asset_id: "uuv-1",
          task_id: "t1",
          operating_point: JSON.stringify({ bearing: 45 }),
          issued_ts: 0,
        },
      ],
    });
    const evals = defaultPlanner.replan({
      input,
      affectedMissionIds: ["m1"],
      baselineCov: { m1: 0.85 },
    });
    expect(evals.length).toBeGreaterThan(0);
    expect(evals.find((e) => e.plan_id === "do-nothing")).toBeDefined();
  });
});
