import { describe, it, expect } from "vitest";
import { buildCommsModel, staticCommsModel } from "@mission-orchestrator/engine";

describe("loadCommsModel (db adapter shape)", () => {
  it("buildCommsModel matches engine graph routing", () => {
    const model = buildCommsModel([
      { from_id: "uuv-1", to_id: "relay", bandwidth_bps: 10_000, delay_s: 2, ts: 0 },
      { from_id: "relay", to_id: "operator", bandwidth_bps: 10_000, delay_s: 3, ts: 0 },
    ]);
    expect(model.route("uuv-1", "operator", 100)).toEqual(["uuv-1", "relay", "operator"]);
    expect(model.pathDelay(0, "uuv-1", "operator")).toBe(5);
  });

  it("static fallback when no links", () => {
    expect(staticCommsModel.linkUtilization([], 50).size).toBe(0);
    expect(staticCommsModel.messageDeliveryTs(10, "a", "b")).toBe(10);
  });
});
