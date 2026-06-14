import { describe, it, expect } from "vitest";
import {
  recomputeMissionStates,
  defaultResolveSpeed,
  type MissionDef,
} from "./stateEngine.js";
import { sandboxMatchesLive, generateCandidates } from "./planner.js";
import { applyPlan, buildEngineInput } from "./applyPlan.js";
import type { Asset, AssetSensor, Belief } from "./types.js";
import { ingestReports } from "./ingest.js";

function demoFixture(): ReturnType<typeof buildEngineInput> {
  const assets: Asset[] = [
    { id: "uuv-1", kind: "UUV", domain: "subsurface", depth_rating_m: 300, top_speed_kn: 8, gps_dependent: false },
    { id: "uuv-2", kind: "UUV", domain: "subsurface", depth_rating_m: 300, top_speed_kn: 8, gps_dependent: false },
  ];
  const sensors: AssetSensor[] = [
    { asset_id: "uuv-1", sensor: "passive_acoustic", base_quality: 0.9, max_range_km: 10, k_motion: 1.6 },
    { asset_id: "uuv-2", sensor: "passive_acoustic", base_quality: 0.9, max_range_km: 10, k_motion: 1.6 },
    { asset_id: "uuv-2", sensor: "eo_ir", base_quality: 0.85, max_range_km: 15, k_motion: 0.36 },
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
    {
      id: "m2",
      name: "Secondary",
      priority: 0.3,
      tasks: [
        {
          id: "t2",
          mission_id: "m2",
          w_t: 1,
          target_x: 5,
          target_y: 0,
          target_depth_m: 0,
          window_end_s: null,
          demands: [{ sensor: "eo_ir", min_quality: 0.4 }],
          constraints: [],
        },
      ],
    },
  ];

  let belief: Belief = new Map();
  belief = ingestReports(
    [
      { ts: 100, asset_id: "uuv-1", field: "x_km", value: 0, confidence: 1, half_life_s: 120 },
      { ts: 100, asset_id: "uuv-1", field: "y_km", value: 0 },
      { ts: 100, asset_id: "uuv-1", field: "depth_m", value: 50 },
      { ts: 100, asset_id: "uuv-1", field: "speed_kn", value: 6 },
      { ts: 100, asset_id: "uuv-2", field: "x_km", value: 4, confidence: 1, half_life_s: 120 },
      { ts: 100, asset_id: "uuv-2", field: "y_km", value: 0 },
      { ts: 100, asset_id: "uuv-2", field: "depth_m", value: 0 },
      { ts: 100, asset_id: "uuv-2", field: "speed_kn", value: 6 },
    ],
    belief
  );

  return buildEngineInput({
    belief,
    assets,
    sensors,
    missions,
    assignments: [
      { id: "a1", asset_id: "uuv-1", task_id: "t1", operating_point: "FAST", issued_ts: 0 },
      { id: "a2", asset_id: "uuv-2", task_id: "t2", operating_point: "FAST", issued_ts: 0 },
    ],
    now: 200,
    covBaselines: new Map([["m1", 0.95], ["m2", 0.8]]),
    resolveSpeed: defaultResolveSpeed,
  });
}

describe("recomputeMissionStates", () => {
  it("planner sandbox matches live path", () => {
    const input = demoFixture();
    expect(sandboxMatchesLive(input, 200)).toBe(true);
  });

  it("dropping vehicle on high-priority task moves cov_now/impact/salience", () => {
    const input = demoFixture();
    const before = recomputeMissionStates(input, 200).find((s) => s.mission_id === "m1")!;
    const degraded = buildEngineInput({
      ...input,
      assignments: input.assignments.filter((a: { asset_id: string }) => a.asset_id !== "uuv-1"),
    });
    const after = recomputeMissionStates(degraded, 200).find((s) => s.mission_id === "m1")!;
    expect(after.cov_now).toBeLessThan(before.cov_now);
    expect(after.impact).toBeGreaterThan(before.impact);
    expect(after.salience).toBeGreaterThan(before.salience);
    expect(after.cov_baseline).toBe(before.cov_baseline);
  });
});

describe("generateCandidates", () => {
  it("includes do-nothing and can rank multi-move plans", () => {
    const input = demoFixture();
    const baseline = Object.fromEntries(
      recomputeMissionStates(input, 200).map((s) => [s.mission_id, s.cov_now])
    );
    const evals = generateCandidates(input, ["m1"], baseline);
    expect(evals.some((e) => e.plan_id === "do-nothing")).toBe(true);
    expect(evals.length).toBeGreaterThan(1);
  });

  it("slow to STATION can outrank reassign for acoustic track (S10)", () => {
    const input = demoFixture();
    const baseline = Object.fromEntries(
      recomputeMissionStates(input, 200).map((s) => [s.mission_id, s.cov_now])
    );
    const evals = generateCandidates(input, ["m1"], baseline);
    const slow = evals.find((e) => e.plan_id.includes("op-uuv-1-STATION"));
    const reassign = evals.find((e) => e.plan_id.startsWith("reassign-"));
    expect(slow).toBeDefined();
    if (slow && reassign) {
      expect(slow.objective).toBeGreaterThanOrEqual(reassign.objective - 0.01);
    }
  });
});

describe("applyPlan", () => {
  it("rejects plan gone infeasible between eval and commit", () => {
    const input = demoFixture();
    const missions = input.missions.map((m) =>
      m.id === "m2"
        ? {
            ...m,
            tasks: m.tasks.map((t) => ({
              ...t,
              demands: [
                { sensor: "passive_acoustic", min_quality: 0.6 },
                ...t.demands,
              ],
            })),
          }
        : m
    );
    const overloadedInput = buildEngineInput({
      ...input,
      missions,
      assignments: [
        { id: "a1", asset_id: "uuv-1", task_id: "t1", operating_point: "FAST", issued_ts: 0 },
        { id: "a2", asset_id: "uuv-1", task_id: "t2", operating_point: "FAST", issued_ts: 0 },
      ],
    });
    const result = applyPlan({ plan_id: "do-nothing", moves: [] }, overloadedInput, 200, 200);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Capacity");
  });

  it("commits valid plan and recomputes mission state", () => {
    const input = demoFixture();
    const plan = {
      plan_id: "slow",
      moves: [{ kind: "set_operating_point" as const, asset_id: "uuv-1", operating_point: "STATION" }],
    };
    const result = applyPlan(plan, input, 200, 200);
    expect(result.ok).toBe(true);
    expect(result.missionStates?.length).toBe(2);
  });
});

describe("defaultResolveSpeed", () => {
  it("resolves operating point handles", () => {
    const asset: Asset = { id: "x", kind: "UUV", domain: "subsurface", depth_rating_m: 100, top_speed_kn: 8, gps_dependent: false };
    expect(defaultResolveSpeed(asset, "STATION")).toBe(0);
    expect(defaultResolveSpeed(asset, "SLOW")).toBe(2);
    expect(defaultResolveSpeed(asset, "FAST")).toBe(8);
  });
});
