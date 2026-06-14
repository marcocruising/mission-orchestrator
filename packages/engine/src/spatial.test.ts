import { describe, it, expect } from "vitest";
import {
  M_PER_KM,
  CV6_STATE_DIM,
  StateLayout,
  depthMToZM,
  zMToDepthM,
  altitudeM,
  depthDisplayM,
  positionFromLegacy,
  positionFromBeliefFields,
  taskTargetToPosition3,
  slantRangeM,
  rangeM,
  rangeKm,
  checkMaxDepthRating,
  checkMinDepth,
  checkMaxAltitude,
  type Position3,
} from "./spatial.js";

describe("spatial — z-up adapters", () => {
  it("depth_m (positive below surface) → z_m = -depth_m", () => {
    expect(depthMToZM(50)).toBe(-50);
    expect(depthMToZM(0)).toBeCloseTo(0);
  });

  it("z_m → depth_m for legacy export", () => {
    expect(zMToDepthM(-50)).toBe(50);
    expect(zMToDepthM(100)).toBe(-100);
  });

  it("altitude and depth display from signed z", () => {
    expect(altitudeM(100)).toBe(100);
    expect(altitudeM(-50)).toBe(0);
    expect(depthDisplayM(-50)).toBe(50);
    expect(depthDisplayM(100)).toBe(0);
  });

  it("positionFromLegacy converts km horizontal and depth_m vertical", () => {
    const p = positionFromLegacy(2.5, -1.0, 40);
    expect(p).toEqual({ x_m: 2500, y_m: -1000, z_m: -40 });
  });

  it("positionFromBeliefFields prefers z_m over depth_m (air assets)", () => {
    const uav = positionFromBeliefFields({ x_km: 1, y_km: 0 }, { z_m: 120, depth_m: 0 });
    expect(uav.z_m).toBe(120);
  });

  it("taskTargetToPosition3 uses target_depth_m", () => {
    const t = taskTargetToPosition3({ target_x: 3, target_y: 4, target_depth_m: 25 });
    expect(t.x_m).toBe(3000);
    expect(t.y_m).toBe(4000);
    expect(t.z_m).toBe(-25);
  });
});

describe("spatial — StateLayout cv6", () => {
  it("defines 6D indices [x, y, z, vx, vy, vz]", () => {
    expect(CV6_STATE_DIM).toBe(6);
    expect(StateLayout.X).toBe(0);
    expect(StateLayout.Y).toBe(1);
    expect(StateLayout.Z).toBe(2);
    expect(StateLayout.VX).toBe(3);
    expect(StateLayout.VY).toBe(4);
    expect(StateLayout.VZ).toBe(5);
  });
});

describe("spatial — slant range seam", () => {
  const surface: Position3 = { x_m: 0, y_m: 0, z_m: 0 };

  it("slantRangeM is Euclidean 3D in meters", () => {
    const target: Position3 = { x_m: 3000, y_m: 4000, z_m: 0 };
    expect(slantRangeM(surface, target)).toBeCloseTo(5000, 6);
  });

  it("vertical separation increases range beyond horizontal-only", () => {
    const horizontalOnly = taskTargetToPosition3({ target_x: 3, target_y: 0, target_depth_m: 0 });
    const submerged = taskTargetToPosition3({ target_x: 3, target_y: 0, target_depth_m: 50 });
    const rFlat = slantRangeM(surface, horizontalOnly);
    const rSlant = slantRangeM(surface, submerged);
    expect(rSlant).toBeGreaterThan(rFlat);
    expect(rFlat).toBeCloseTo(3000, 6);
    expect(rSlant).toBeCloseTo(Math.hypot(3000, 50), 6);
  });

  it("rangeKm returns slant range in kilometers", () => {
    const target = taskTargetToPosition3({ target_x: 1, target_y: 0, target_depth_m: 0 });
    expect(rangeKm(surface, target)).toBeCloseTo(1, 9);
  });

  it("rangeM equals slantRangeM", () => {
    const a: Position3 = { x_m: 100, y_m: 200, z_m: -30 };
    const b: Position3 = { x_m: 400, y_m: 500, z_m: 10 };
    expect(rangeM(a, b)).toBe(slantRangeM(a, b));
  });

  it("M_PER_KM is 1000", () => {
    expect(M_PER_KM).toBe(1000);
    expect(rangeKm(surface, { x_m: 500, y_m: 0, z_m: 0 })).toBeCloseTo(0.5, 9);
  });
});

describe("spatial — z gates (P5)", () => {
  it("max depth rating: z_m ≥ -depth_rating_m", () => {
    expect(checkMaxDepthRating(-50, 100)).toBe(true);
    expect(checkMaxDepthRating(-150, 100)).toBe(false);
    expect(checkMaxDepthRating(50, 100)).toBe(true);
  });

  it("min depth: z_m ≤ -min_depth_m", () => {
    expect(checkMinDepth(-250, 250)).toBe(true);
    expect(checkMinDepth(-100, 250)).toBe(false);
  });

  it("max altitude: 0 ≤ z_m ≤ max_altitude_m", () => {
    expect(checkMaxAltitude(100, 500)).toBe(true);
    expect(checkMaxAltitude(600, 500)).toBe(false);
    expect(checkMaxAltitude(-10, 500)).toBe(false);
  });
});
