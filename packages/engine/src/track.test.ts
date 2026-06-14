import { describe, it, expect } from "vitest";
import { createInitialEstimate, covToEllipse } from "./estimate.js";
import { positionMeasurement } from "./measurement.js";
import { FixedGainEstimator, runEstimatorPipeline } from "./estimator.js";
import { createTrackFromObservation, mergeTrackObservation } from "./track.js";
import { ownAssetSearchRegion, searchEllipseSemiMajor } from "./searchRegion.js";
import { kmToM } from "./spatial.js";

describe("Track (T2.4)", () => {
  it("createTrackFromObservation stores estimate and contributor", () => {
    const est = createInitialEstimate(1000, 2000, 0, 10, 1000);
    const obs = {
      ...positionMeasurement([1000, 2000], 500, 10, { x_km: 0, y_km: 0 }, "uuv-alpha", "radar"),
      track_id: "contact-1",
    };
    const track = createTrackFromObservation("contact-1", obs, est);
    expect(track.id).toBe("contact-1");
    expect(track.contributing).toEqual(["uuv-alpha"]);
    expect(track.estimate.mean[0]).toBe(1000);
  });

  it("mergeTrackObservation accumulates unique contributors", () => {
    const est = createInitialEstimate(0, 0, 0, 0);
    const track = createTrackFromObservation(
      "t1",
      { ...positionMeasurement([0, 0], 1000, 1, { x_km: 0, y_km: 0 }, "a", "r"), track_id: "t1" },
      est
    );
    const obs2 = { ...positionMeasurement([1000, 0], 1000, 2, { x_km: 0, y_km: 0 }, "b", "r"), track_id: "t1" };
    const merged = mergeTrackObservation(track, obs2, est);
    expect(merged.contributing).toEqual(["a", "b"]);
    expect(merged.last_updated).toBe(2);
  });

  it("track uncertainty region shares renderer shape with own-asset search region", () => {
    const estimator = new FixedGainEstimator();
    const initial = createInitialEstimate(kmToM(3), kmToM(4), 0, 0, 2000);
    const fused = runEstimatorPipeline(estimator, initial, [
      positionMeasurement([3200, 4100], 600, 1, { x_km: 0, y_km: 0 }, "s1", "radar"),
    ]);
    const trackRegion = covToEllipse(fused.cov, fused.mean);
    const ownRegion = ownAssetSearchRegion(3, 4, 0, 10, 7200, 0);
    expect(trackRegion).toMatchObject({
      center: expect.objectContaining({ x_km: expect.any(Number), y_km: expect.any(Number) }),
      semiMajor: expect.any(Number),
      semiMinor: expect.any(Number),
      angleRad: expect.any(Number),
    });
    expect(ownRegion.semiMajor).toBeGreaterThan(ownRegion.semiMinor);
    expect(ownRegion.semiMajor).toBeCloseTo(searchEllipseSemiMajor(10, 7200, 0), 6);
  });
});
