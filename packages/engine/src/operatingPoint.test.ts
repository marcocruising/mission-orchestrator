import { describe, it, expect } from "vitest";
import {
  defaultResolveOperatingPoint,
  resolveSpeedKn,
  type ResolvedOperatingPoint,
} from "./operatingPoint.js";
import type { Asset } from "./types.js";

const asset: Asset = {
  id: "uuv-1",
  kind: "UUV",
  domain: "subsurface",
  depth_rating_m: 300,
  top_speed_kn: 8,
  gps_dependent: false,
};

describe("resolveOperatingPoint (A0.8 — opaque handle seam)", () => {
  it("STATION resolves to zero speed", () => {
    expect(defaultResolveOperatingPoint(asset, "STATION").speed_kn).toBe(0);
  });

  it("SLOW and FAST enum handles resolve to expected speeds", () => {
    expect(defaultResolveOperatingPoint(asset, "SLOW").speed_kn).toBe(2);
    expect(defaultResolveOperatingPoint(asset, "FAST").speed_kn).toBe(8);
  });

  it("numeric string handle resolves to that speed in knots", () => {
    expect(defaultResolveOperatingPoint(asset, "3.5").speed_kn).toBe(3.5);
  });

  it("JSON bearing handle resolves through the same path without planner introspection", () => {
    const resolved = defaultResolveOperatingPoint(asset, JSON.stringify({ bearing: 45 }));
    expect(resolved.speed_kn).toBe(2);
    expect(resolved.bearing_deg).toBe(45);
    expect(resolved.raw_handle).toBe(JSON.stringify({ bearing: 45 }));
  });

  it("enum and JSON handles both produce ResolvedOperatingPoint with raw_handle preserved", () => {
    const fromEnum: ResolvedOperatingPoint = defaultResolveOperatingPoint(asset, "SLOW");
    const fromJson: ResolvedOperatingPoint = defaultResolveOperatingPoint(
      asset,
      JSON.stringify({ bearing: 90, speed: "FAST" })
    );
    expect(fromEnum.raw_handle).toBe("SLOW");
    expect(fromJson.speed_kn).toBe(8);
    expect(fromJson.bearing_deg).toBe(90);
  });

  it("patrol handle resolves to SLOW listen speed without exposing cell id to planner", () => {
    const resolved = defaultResolveOperatingPoint(asset, "patrol:c:001:002:000");
    expect(resolved.speed_kn).toBe(2);
    expect(resolved.raw_handle).toBe("patrol:c:001:002:000");
    expect(resolved.bearing_deg).toBeUndefined();
  });

  it("resolveSpeedKn matches speed_kn from defaultResolveOperatingPoint", () => {
    for (const handle of ["STATION", "SLOW", "FAST", "4"]) {
      expect(resolveSpeedKn(asset, handle)).toBe(
        defaultResolveOperatingPoint(asset, handle).speed_kn
      );
    }
  });
});
