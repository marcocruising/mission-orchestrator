import { describe, it, expect } from "vitest";
import {
  staticCommsModel,
  type CommsModel,
  type CommsLink,
} from "./commsModel.js";
import { checkFleetCommsGate } from "./stateEngine.js";
import type { Assignment } from "./stateEngine.js";

const assignments: Assignment[] = [
  { id: "a1", asset_id: "uuv-1", task_id: "t1", operating_point: "SLOW", issued_ts: 0 },
  { id: "a2", asset_id: "uuv-2", task_id: "t2", operating_point: "FAST", issued_ts: 0 },
];

describe("CommsModel (A0.7 — stub body, swappable implementation)", () => {
  it("staticCommsModel reports zero fleet usage", () => {
    expect(staticCommsModel.fleetUsage(assignments, 200)).toBe(0);
  });

  it("staticCommsModel has zero delay — delivery ts equals sent ts", () => {
    expect(staticCommsModel.messageDeliveryTs(100, "uuv-1", "shore")).toBe(100);
  });

  it("staticCommsModel linkBudget returns unlimited stub link", () => {
    const link = staticCommsModel.linkBudget("uuv-1", "shore", 200);
    expect(link).not.toBeNull();
    expect(link!.delay_s).toBe(0);
    expect(link!.bandwidth_bps).toBeGreaterThan(0);
  });
});

describe("checkFleetCommsGate with CommsModel (A0.7)", () => {
  it("passes when fleetUsage is within budget", () => {
    expect(checkFleetCommsGate(assignments, staticCommsModel, 200, 10)).toBe(true);
  });

  it("rejects when fleetUsage exceeds budget", () => {
    const congested: CommsModel = {
      linkBudget(): CommsLink {
        return {
          from_id: "uuv-1",
          to_id: "shore",
          bandwidth_bps: 1,
          delay_s: 0,
          ts: 0,
        };
      },
      messageDeliveryTs(sentTs) {
        return sentTs;
      },
      fleetUsage() {
        return 100;
      },
    };
    expect(checkFleetCommsGate(assignments, congested, 200, 50)).toBe(false);
    expect(checkFleetCommsGate(assignments, congested, 200, 150)).toBe(true);
  });

  it("uses fleetUsage not assignment count — many assignments can pass with zero usage", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `a${i}`,
      asset_id: `uuv-${i}`,
      task_id: "t1",
      operating_point: "SLOW",
      issued_ts: 0,
    }));
    expect(checkFleetCommsGate(many, staticCommsModel, 200, 1)).toBe(true);
  });
});
