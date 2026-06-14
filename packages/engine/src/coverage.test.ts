import { describe, it, expect } from "vitest";
import {
  INFEASIBLE,
  effectiveQuality,
  satisfaction,
  coverageTask,
  coverageMission,
  tier,
  confidenceMission,
  rangeMult,
  isInfeasible,
  minAxisAggregator,
  meanAxisAggregator,
  type SensorSpec,
  type VehicleState,
} from "./coverage.js";
import { envMultMotion } from "./envMult.js";
import { freshness } from "./freshness.js";

const passiveAcoustic: SensorSpec = {
  sensor: "passive_acoustic",
  base_quality: 0.9,
  max_range_km: 10,
  k_motion: 1.6,
};

const eoIr: SensorSpec = {
  sensor: "eo_ir",
  base_quality: 0.85,
  max_range_km: 15,
  k_motion: 0.36,
};

const vehicle = (overrides: Partial<VehicleState> = {}): VehicleState => ({
  asset_id: "v1",
  x_km: 0,
  y_km: 0,
  depth_m: 50,
  speed_kn: 4,
  top_speed_kn: 8,
  ...overrides,
});

describe("effectiveQuality", () => {
  it("hard cutoff failure prunes (INFEASIBLE), not low score", () => {
    const q = effectiveQuality(
      passiveAcoustic,
      { target_x: 20, target_y: 0, target_depth_m: 0 },
      vehicle()
    );
    expect(q).toBe(INFEASIBLE);
  });

  it("quality is monotonic — closer range → higher quality", () => {
    const near = effectiveQuality(passiveAcoustic, { target_x: 2, target_y: 0, target_depth_m: 0 }, vehicle());
    const far = effectiveQuality(passiveAcoustic, { target_x: 8, target_y: 0, target_depth_m: 0 }, vehicle());
    expect(isInfeasible(near)).toBe(false);
    expect(isInfeasible(far)).toBe(false);
    expect(near as number).toBeGreaterThan(far as number);
  });

  it("quality is monotonic — slower speed → higher quality for motion-sensitive sensor", () => {
    const slow = effectiveQuality(
      passiveAcoustic,
      { target_x: 2, target_y: 0, target_depth_m: 0 },
      vehicle({ speed_kn: 1 })
    );
    const fast = effectiveQuality(
      passiveAcoustic,
      { target_x: 2, target_y: 0, target_depth_m: 0 },
      vehicle({ speed_kn: 7 })
    );
    expect(slow as number).toBeGreaterThan(fast as number);
  });
});

describe("coverageTask (min within task)", () => {
  it("two-sensor task capped by weaker axis", () => {
    const strong = 0.9;
    const weak = 0.3;
    expect(coverageTask([strong, weak])).toBe(0.3);
  });

  it("two vehicles on different axes sum via satisfaction", () => {
    const q1 = effectiveQuality(passiveAcoustic, { target_x: 1, target_y: 0, target_depth_m: 0 }, vehicle({ asset_id: "v1" }));
    const q2 = effectiveQuality(eoIr, { target_x: 1, target_y: 0, target_depth_m: 0 }, vehicle({ asset_id: "v2", x_km: 1 }));
    const satAcoustic = satisfaction([q1 as number], 0.5);
    const satEo = satisfaction([q2 as number], 0.5);
    const cov = coverageTask([satAcoustic as number, satEo as number]);
    expect(cov).toBeGreaterThan(0.5);
  });
});

describe("coverageTask aggregator seam (A0.3)", () => {
  it("default aggregator is min — explicit minAxisAggregator matches omitting the argument", () => {
    const axes = [0.9, 0.3];
    expect(coverageTask(axes)).toBe(0.3);
    expect(coverageTask(axes, minAxisAggregator)).toBe(0.3);
  });

  it("swapping to meanAxisAggregator raises task coverage when one axis is weak", () => {
    const axes = [0.9, 0.3];
    const withMin = coverageTask(axes, minAxisAggregator);
    const withMean = coverageTask(axes, meanAxisAggregator);
    expect(withMin).toBe(0.3);
    expect(withMean).toBeCloseTo(0.6);
    expect(withMean as number).toBeGreaterThan(withMin as number);
  });

  it("mean aggregator does not ignore the weak axis entirely", () => {
    expect(coverageTask([1.0, 0.0], meanAxisAggregator)).toBeCloseTo(0.5);
    expect(coverageTask([1.0, 0.0], meanAxisAggregator)).toBeLessThan(1.0);
  });

  it("infeasible axis short-circuits before aggregator runs", () => {
    expect(coverageTask([0.8, INFEASIBLE], meanAxisAggregator)).toBe(INFEASIBLE);
  });

  it("empty axis list returns 1 regardless of aggregator", () => {
    expect(coverageTask([], minAxisAggregator)).toBe(1);
    expect(coverageTask([], meanAxisAggregator)).toBe(1);
  });
});

describe("coverageMission (weighted average)", () => {
  it("failed minor task degrades, does not zero mission", () => {
    const cov = coverageMission([
      { w_t: 0.8, cov_t: 1.0 },
      { w_t: 0.2, cov_t: 0.0 },
    ]);
    expect(cov).toBeCloseTo(0.8);
    expect(cov).toBeGreaterThan(0);
  });
});

describe("confidence independent of coverage (P6)", () => {
  it("stale data drops confidence, not coverage", () => {
    const cov = coverageMission([{ w_t: 1, cov_t: 0.9 }]);
    const freshConf = confidenceMission([freshness(0)]);
    const staleConf = confidenceMission([freshness(600)]);
    expect(cov).toBeCloseTo(0.9);
    expect(freshConf).toBe(1);
    expect(staleConf).toBeLessThan(freshConf);
    expect(staleConf).toBeLessThan(0.2);
  });
});

describe("extensibility — new sensor needs zero engine changes", () => {
  it("accepts arbitrary sensor registry entry", () => {
    const magneticAnomaly: SensorSpec = {
      sensor: "magnetic_anomaly_detector",
      base_quality: 0.7,
      max_range_km: 5,
      k_motion: 0.1,
    };
    const q = effectiveQuality(
      magneticAnomaly,
      { target_x: 1, target_y: 0, target_depth_m: 0 },
      vehicle()
    );
    expect(isInfeasible(q)).toBe(false);
    expect(q as number).toBeGreaterThan(0);
  });
});

describe("tier thresholds", () => {
  it("maps coverage to tiers", () => {
    expect(tier(0.9)).toBe("FULL");
    expect(tier(0.7)).toBe("DEGRADED");
    expect(tier(0.4)).toBe("AT_RISK");
    expect(tier(0.1)).toBe("LOST");
  });
});

describe("rangeMult and envMult units", () => {
  it("rangeMult at max range is 0", () => {
    expect(rangeMult(10, 10)).toBe(0);
  });

  it("envMult at zero speed is 1", () => {
    expect(envMultMotion(1.6, 0, 8)).toBe(1);
  });
});
