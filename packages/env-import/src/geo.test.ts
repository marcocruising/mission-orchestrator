import { describe, it, expect } from "vitest";
import { kmToLatLon, latLonToKm, scenarioBBox } from "./geo.js";

const geo = { origin_lat: 56.5, origin_lon: 1.0 };

describe("geo", () => {
  it("round-trips scenario origin", () => {
    const { lat, lon } = kmToLatLon(geo, 0, 0);
    expect(lat).toBeCloseTo(56.5, 5);
    expect(lon).toBeCloseTo(1.0, 5);
    const km = latLonToKm(geo, lat, lon);
    expect(km.x_km).toBeCloseTo(0, 3);
    expect(km.y_km).toBeCloseTo(0, 3);
  });

  it("10 km east increases longitude", () => {
    const { lon } = kmToLatLon(geo, 10, 0);
    expect(lon).toBeGreaterThan(geo.origin_lon);
  });

  it("scenarioBBox covers 20×20 km extent", () => {
    const box = scenarioBBox(geo, { min: 0, max: 20 });
    expect(box.min_lat).toBeLessThan(geo.origin_lat);
    expect(box.max_lat).toBeGreaterThan(kmToLatLon(geo, 0, 20).lat);
  });
});
