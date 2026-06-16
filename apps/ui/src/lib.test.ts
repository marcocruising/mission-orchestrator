import { describe, it, expect } from "vitest";
import { ownAssetSearchUncertainty, searchEllipseSemiMajor } from "./lib.js";

describe("lib", () => {
  it("search ellipse grows with staleness via unified SearchUncertainty", () => {
    expect(searchEllipseSemiMajor(10, 7200, 0)).toBeGreaterThan(searchEllipseSemiMajor(10, 3600, 0));
    const stale = ownAssetSearchUncertainty(0, 0, 0, 10, 7200, 0);
    const fresh = ownAssetSearchUncertainty(0, 0, 0, 10, 3600, 0);
    expect(stale.region.semiMajor).toBeGreaterThan(fresh.region.semiMajor);
    expect(stale.z_sigma_m).toBeGreaterThan(fresh.z_sigma_m);
  });

  it("tierColor maps mission tiers", async () => {
    const { tierColor } = await import("./lib.js");
    expect(tierColor("FULL")).toBe("#34b58a");
    expect(tierColor("LOST")).toBe("#d2495f");
  });
});
