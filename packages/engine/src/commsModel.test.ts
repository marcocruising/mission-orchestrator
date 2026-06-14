import { describe, it, expect } from "vitest";
import {
  staticCommsModel,
  buildCommsModel,
  type CommsModel,
  type CommsLink,
  type CommsLinkRow,
} from "./commsModel.js";
import { checkFleetCommsGate } from "./stateEngine.js";
import type { Assignment } from "./stateEngine.js";

const assignments: Assignment[] = [
  { id: "a1", asset_id: "uuv-1", task_id: "t1", operating_point: "SLOW", issued_ts: 0 },
  { id: "a2", asset_id: "uuv-2", task_id: "t2", operating_point: "FAST", issued_ts: 0 },
];

const twoHopLinks: CommsLinkRow[] = [
  { from_id: "uuv-1", to_id: "relay", bandwidth_bps: 10_000, delay_s: 2, ts: 0 },
  { from_id: "relay", to_id: "operator", bandwidth_bps: 10_000, delay_s: 3, ts: 0 },
];

const sharedRelayLinks: CommsLinkRow[] = [
  { from_id: "uuv-1", to_id: "relay", bandwidth_bps: 10_000, delay_s: 1, ts: 0 },
  { from_id: "uuv-2", to_id: "relay", bandwidth_bps: 10_000, delay_s: 1, ts: 0 },
  { from_id: "relay", to_id: "operator", bandwidth_bps: 1_000, delay_s: 1, ts: 0 },
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

  it("staticCommsModel returns empty linkUtilization — gate falls back to fleetUsage", () => {
    expect(staticCommsModel.linkUtilization(assignments, 200).size).toBe(0);
    expect(staticCommsModel.route("uuv-1", "operator", 200)).toEqual(["uuv-1", "operator"]);
  });
});

describe("buildCommsModel graph (A3 — route + per-link utilization)", () => {
  it("two-hop route: delay equals sum of hop delays", () => {
    const model = buildCommsModel(twoHopLinks);
    expect(model.route("uuv-1", "operator", 100)).toEqual(["uuv-1", "relay", "operator"]);
    expect(model.pathDelay(0, "uuv-1", "operator")).toBe(5);
    expect(model.messageDeliveryTs(10, "uuv-1", "operator")).toBe(15);
  });

  it("two assets sharing one relay link: utilization rises on that link", () => {
    const model = buildCommsModel(sharedRelayLinks, { loadBps: 1_000 });
    const oneAsset: Assignment[] = [
      { id: "a1", asset_id: "uuv-1", task_id: "t1", operating_point: "SLOW", issued_ts: 0 },
    ];
    const twoAssets: Assignment[] = [
      { id: "a1", asset_id: "uuv-1", task_id: "t1", operating_point: "SLOW", issued_ts: 0 },
      { id: "a2", asset_id: "uuv-2", task_id: "t2", operating_point: "FAST", issued_ts: 0 },
    ];

    const utilOne = model.linkUtilization(oneAsset, 0);
    const utilTwo = model.linkUtilization(twoAssets, 0);
    const relayKey = "relay:operator";

    expect(utilOne.get(relayKey)).toBe(1);
    expect(utilTwo.get(relayKey)).toBe(2);
    expect(utilTwo.get(relayKey)! > utilOne.get(relayKey)!).toBe(true);
  });

  it("gate rejects when shared relay link is over budget", () => {
    const model = buildCommsModel(sharedRelayLinks, { loadBps: 1_000 });
    const twoAssets: Assignment[] = [
      { id: "a1", asset_id: "uuv-1", task_id: "t1", operating_point: "SLOW", issued_ts: 0 },
      { id: "a2", asset_id: "uuv-2", task_id: "t2", operating_point: "FAST", issued_ts: 0 },
    ];
    expect(checkFleetCommsGate(twoAssets, model, 0, 1_000_000)).toBe(false);

    const oneAsset: Assignment[] = [
      { id: "a1", asset_id: "uuv-1", task_id: "t1", operating_point: "SLOW", issued_ts: 0 },
    ];
    expect(checkFleetCommsGate(oneAsset, model, 0, 1_000_000)).toBe(true);
  });

  it("uses latest link snapshot at or before query ts", () => {
    const links: CommsLinkRow[] = [
      { from_id: "a", to_id: "b", bandwidth_bps: 1, delay_s: 1, ts: 0 },
      { from_id: "a", to_id: "b", bandwidth_bps: 1, delay_s: 9, ts: 100 },
    ];
    const model = buildCommsModel(links);
    expect(model.pathDelay(0, "a", "b")).toBe(1);
    expect(model.pathDelay(0, "a", "b", 50)).toBe(1);
    expect(model.pathDelay(0, "a", "b", 100)).toBe(9);
  });

  it("messageDeliveryTs uses queryTs for link snapshot when sentTs differs", () => {
    const links: CommsLinkRow[] = [
      { from_id: "a", to_id: "b", bandwidth_bps: 1, delay_s: 5, ts: 100 },
    ];
    const model = buildCommsModel(links);
    expect(model.messageDeliveryTs(10, "a", "b")).toBe(10);
    expect(model.messageDeliveryTs(10, "a", "b", 100)).toBe(15);
  });
});

describe("checkFleetCommsGate with CommsModel (A0.7 + A3)", () => {
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
      route(from, to) {
        return [from, to];
      },
      pathDelay() {
        return 0;
      },
      linkUtilization() {
        return new Map();
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
