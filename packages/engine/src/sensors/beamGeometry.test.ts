import { describe, it, expect } from "vitest";
import { beamGain, inBeamRange, losAnglesDeg, pointingSeparationDeg } from "./beamGeometry.js";

describe("beamGeometry (C2)", () => {
  it("beamGain is 1.0 on boresight and 0 at beam edge", () => {
    expect(beamGain(0, 30)).toBe(1);
    expect(beamGain(30, 30)).toBe(0);
    expect(beamGain(15, 30)).toBeCloseTo(Math.cos(Math.PI / 4), 5);
  });

  it("inBeamRange accepts targets inside cone", () => {
    expect(inBeamRange(30, 0, 0, 10, 0)).toBe(true);
    expect(inBeamRange(30, 0, 0, 90, 0)).toBe(false);
  });

  it("omnidirectional sensors (no half-angle) always in beam", () => {
    expect(inBeamRange(undefined, 0, 0, 180, 45)).toBe(true);
  });

  it("losAnglesDeg computes bearing in horizontal plane", () => {
    const { bearing_deg, elevation_deg } = losAnglesDeg(
      { x_m: 0, y_m: 0, z_m: 0 },
      { x_m: 1000, y_m: 0, z_m: 0 }
    );
    expect(bearing_deg).toBeCloseTo(0, 5);
    expect(elevation_deg).toBeCloseTo(0, 5);
  });

  it("pointingSeparationDeg is 0 for identical vectors", () => {
    expect(pointingSeparationDeg({ bearing_deg: 45, elevation_deg: 5 }, { bearing_deg: 45, elevation_deg: 5 })).toBeCloseTo(0, 5);
  });
});
