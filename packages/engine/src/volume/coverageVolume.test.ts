import { describe, it, expect } from "vitest";
import { coverageVolume, cellVisitScore } from "./coverageVolume.js";
import { buildEngineInput } from "../applyPlan.js";
import { defaultResolveOperatingPoint } from "../stateEngine.js";
import { ingestReports } from "../ingest.js";
import type { Asset, AssetSensor, Belief } from "../types.js";
import type { AreaTaskParams, VolumeVisitRecord } from "./footprint.js";
import type { TaskDef } from "../stateEngine.js";

function patrolParams(overrides: Partial<AreaTaskParams> = {}): AreaTaskParams {
  return {
    footprint: {
      kind: "aabb",
      center: { x_m: 0, y_m: 0 },
      half_extent_m: { x: 500, y: 500 },
    },
    z_min_m: -60,
    z_max_m: -40,
    revisit_interval_s: 600,
    cell_size_m: 500,
    ...overrides,
  };
}

function makeVolumeCtx(opts: {
  xKm?: number;
  yKm?: number;
  depthM?: number;
  now?: number;
  params?: AreaTaskParams;
  visits?: VolumeVisitRecord[];
}) {
  const assets: Asset[] = [
    { id: "uuv-1", kind: "UUV", domain: "subsurface", depth_rating_m: 300, top_speed_kn: 8, gps_dependent: false },
  ];
  const sensors: AssetSensor[] = [
    { asset_id: "uuv-1", sensor: "passive_acoustic", base_quality: 0.9, max_range_km: 10, k_motion: 1.6 },
  ];
  const belief: Belief = ingestReports(
    [
      { ts: 100, asset_id: "uuv-1", field: "x_km", value: opts.xKm ?? 0, confidence: 1, half_life_s: 120 },
      { ts: 100, asset_id: "uuv-1", field: "y_km", value: opts.yKm ?? 0 },
      { ts: 100, asset_id: "uuv-1", field: "depth_m", value: opts.depthM ?? 50 },
      { ts: 100, asset_id: "uuv-1", field: "speed_kn", value: 2 },
    ],
    new Map()
  );

  const params = opts.params ?? patrolParams();
  const task: TaskDef = {
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
    area: params,
  };

  const input = buildEngineInput({
    belief,
    assets,
    sensors,
    missions: [{ id: "m-area", name: "Area", priority: 1, tasks: [task] }],
    assignments: [{ id: "a1", asset_id: "uuv-1", task_id: "t-area", operating_point: "SLOW", issued_ts: 0 }],
    now: opts.now ?? 200,
    covBaselines: new Map(),
    resolveOperatingPoint: defaultResolveOperatingPoint,
  });

  return {
    task,
    params,
    visits: opts.visits ?? [],
    ...input,
  };
}

describe("coverageVolume (C1 body)", () => {
  it("coverage rises when vehicle is inside the patrol volume", () => {
    const insideCtx = makeVolumeCtx({ xKm: 0, yKm: 0, depthM: 50 });
    const outsideCtx = makeVolumeCtx({ xKm: 20, yKm: 0, depthM: 50 });

    const inside = coverageVolume({
      task: insideCtx.task,
      params: insideCtx.params,
      visits: [],
      assignments: insideCtx.assignments,
      belief: insideCtx.belief,
      assets: insideCtx.assets,
      sensors: insideCtx.sensors,
      demands: insideCtx.task.demands,
      now: insideCtx.now,
      p: insideCtx.config.p,
      environmentContext: insideCtx.environmentContext,
      resolveOperatingPoint: insideCtx.resolveOperatingPoint,
    });
    const outside = coverageVolume({
      task: outsideCtx.task,
      params: outsideCtx.params,
      visits: [],
      assignments: outsideCtx.assignments,
      belief: outsideCtx.belief,
      assets: outsideCtx.assets,
      sensors: outsideCtx.sensors,
      demands: outsideCtx.task.demands,
      now: outsideCtx.now,
      p: outsideCtx.config.p,
      environmentContext: outsideCtx.environmentContext,
      resolveOperatingPoint: outsideCtx.resolveOperatingPoint,
    });

    expect(inside.cov_t).toBeGreaterThan(outside.cov_t);
    expect(inside.cov_t).toBeGreaterThan(0);
    expect(inside.volumeVisits.length).toBeGreaterThan(0);
  });

  it("one vehicle cannot instantly blanket a volume larger than sensor range", () => {
    const params = patrolParams({
      footprint: {
        kind: "aabb",
        center: { x_m: 0, y_m: 0 },
        half_extent_m: { x: 8000, y: 8000 },
      },
      cell_size_m: 2000,
    });
    const ctx = makeVolumeCtx({ params, xKm: 0, yKm: 0, depthM: 50 });
    const result = coverageVolume({
      task: ctx.task,
      params,
      visits: [],
      assignments: ctx.assignments,
      belief: ctx.belief,
      assets: ctx.assets,
      sensors: ctx.sensors,
      demands: ctx.task.demands,
      now: ctx.now,
      p: ctx.config.p,
      environmentContext: ctx.environmentContext,
      resolveOperatingPoint: ctx.resolveOperatingPoint,
    });
    expect(result.cov_t).toBeLessThan(1);
    expect(result.cov_t).toBeGreaterThan(0);
  });

  it("unrevisited cells decay after revisit_interval_s", () => {
    const params = patrolParams({ revisit_interval_s: 600 });
    const ctx = makeVolumeCtx({ params, now: 200 });
    const first = coverageVolume({
      task: ctx.task,
      params,
      visits: [],
      assignments: ctx.assignments,
      belief: ctx.belief,
      assets: ctx.assets,
      sensors: ctx.sensors,
      demands: ctx.task.demands,
      now: 200,
      p: ctx.config.p,
      environmentContext: ctx.environmentContext,
      resolveOperatingPoint: ctx.resolveOperatingPoint,
    });
    expect(first.cov_t).toBeGreaterThan(0);

    const staleCtx = makeVolumeCtx({ params, now: 200 + 601, xKm: 20, yKm: 0, depthM: 50 });
    const stale = coverageVolume({
      task: staleCtx.task,
      params,
      visits: first.volumeVisits,
      assignments: staleCtx.assignments,
      belief: staleCtx.belief,
      assets: staleCtx.assets,
      sensors: staleCtx.sensors,
      demands: staleCtx.task.demands,
      now: 200 + 601,
      p: staleCtx.config.p,
      environmentContext: staleCtx.environmentContext,
      resolveOperatingPoint: staleCtx.resolveOperatingPoint,
    });
    expect(stale.cov_t).toBeLessThan(first.cov_t);
    expect(stale.cov_t).toBe(0);
  });

  it("cellVisitScore linearly decays to zero at interval boundary", () => {
    const mid = cellVisitScore(
      { cell_id: "c:0:0:0", last_visit_ts: 0, peak_quality: 0.8 },
      300,
      600
    );
    expect(mid).toBeCloseTo(0.4, 5);
    expect(cellVisitScore({ cell_id: "c:0:0:0", last_visit_ts: 0, peak_quality: 0.8 }, 600, 600)).toBe(0);
  });
});
