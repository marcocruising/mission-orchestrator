import { describe, it, expect } from "vitest";
import { discretizeFootprint, type Footprint } from "./footprint.js";

describe("discretizeFootprint (AABB v1)", () => {
  const aabb: Footprint = {
    kind: "aabb",
    center: { x_m: 2000, y_m: 0 },
    half_extent_m: { x: 1000, y: 1000 },
  };

  it("produces expected cell count for 2 km × 2 km × 40 m band at 500 m cells", () => {
    const cells = discretizeFootprint(aabb, -80, -40, 500);
    expect(cells).toHaveLength(16);
  });

  it("uses half-cell-inset centers on each axis", () => {
    const cells = discretizeFootprint(
      {
        kind: "aabb",
        center: { x_m: 0, y_m: 0 },
        half_extent_m: { x: 250, y: 250 },
      },
      -50,
      -50,
      500
    );
    expect(cells).toHaveLength(1);
    expect(cells[0]!.center).toEqual({ x_m: 0, y_m: 0, z_m: -50 });
  });

  it("submerged z band uses z-up bounds (deeper = more negative)", () => {
    const cells = discretizeFootprint(aabb, -80, -40, 500);
    const zValues = [...new Set(cells.map((c) => c.center.z_m))];
    expect(zValues).toEqual([-60]);
  });

  it("cell_id strings are stable across calls", () => {
    const a = discretizeFootprint(aabb, -80, -40, 500);
    const b = discretizeFootprint(aabb, -80, -40, 500);
    expect(a.map((c) => c.cell_id)).toEqual(b.map((c) => c.cell_id));
    expect(a[0]!.cell_id).toMatch(/^c:\d{3}:\d{3}:\d{3}$/);
  });

  it("rejects polygon kind until C1-polygon", () => {
    expect(() =>
      discretizeFootprint(
        { kind: "polygon", vertices_xy_m: [{ x_m: 0, y_m: 0 }] },
        -80,
        -40,
        500
      )
    ).toThrow(/not implemented/i);
  });
});
