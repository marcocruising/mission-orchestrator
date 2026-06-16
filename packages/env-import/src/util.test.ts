import { describe, it, expect } from "vitest";
import { currentToUV, kmhToMs, nearestHourlyIndex } from "./util.js";

describe("util", () => {
  it("converts km/h to m/s", () => {
    expect(kmhToMs(36)).toBeCloseTo(10, 5);
  });

  it("decomposes ocean current toward east", () => {
    const { u_ms, v_ms } = currentToUV(3.6, 90);
    expect(u_ms).toBeCloseTo(1, 5);
    expect(v_ms).toBeCloseTo(0, 5);
  });

  it("picks nearest hourly index", () => {
    const times = ["2026-06-15T11:00Z", "2026-06-15T12:00Z", "2026-06-15T13:00Z"];
    const target = Math.floor(Date.parse("2026-06-15T12:30:00Z") / 1000);
    expect(nearestHourlyIndex(times, target)).toBe(1);
  });
});
