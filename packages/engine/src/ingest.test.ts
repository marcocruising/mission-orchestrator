import { describe, it, expect } from "vitest";
import { ingestReports, mergeReportIntoBelief, reportToFact } from "./ingest.js";
import { buildCommsModel } from "./commsModel.js";
import { reconcile } from "./reconcile.js";
import { Simulator } from "./simulator.js";
import type { Asset, Belief } from "./types.js";
import { getFact } from "./types.js";

const asset: Asset = {
  id: "uuv-1",
  kind: "UUV",
  domain: "subsurface",
  depth_rating_m: 300,
  top_speed_kn: 8,
  gps_dependent: false,
};

describe("ingest uses reconcile (A0.1)", () => {
  it("conflicting reports for same field go through reconcile — newer value and confidence win", () => {
    const belief = ingestReports([
      {
        ts: 100,
        asset_id: "uuv-1",
        field: "x_km",
        value: 1,
        confidence: 0.95,
      },
      {
        ts: 200,
        asset_id: "uuv-1",
        field: "x_km",
        value: 7.5,
        confidence: 0.4,
      },
    ]);
    const fact = getFact(belief, "uuv-1", "x_km");
    expect(fact?.value).toBe(7.5);
    expect(fact?.confidence).toBe(0.4);
  });

  it("mergeReportIntoBelief matches reconcile(reportToFact) for each step", () => {
    const report = { ts: 50, asset_id: "a", field: "x_km", value: 3, confidence: 0.55 };
    const existing = reportToFact({ ts: 10, asset_id: "a", field: "x_km", value: 1, confidence: 0.9 });
    const belief = new Map([["a:x_km", existing]]);
    const after = mergeReportIntoBelief(belief, report);
    expect(getFact(after, "a", "x_km")).toEqual(reconcile(existing, reportToFact(report)));
  });
});

describe("ingestReports", () => {
  it("last-write-by-ts wins", () => {
    const belief = ingestReports([
      { ts: 10, asset_id: "uuv-1", field: "x_km", value: 1 },
      { ts: 20, asset_id: "uuv-1", field: "x_km", value: 2 },
      { ts: 15, asset_id: "uuv-1", field: "x_km", value: 99 },
    ]);
    expect(getFact(belief, "uuv-1", "x_km")?.value).toBe(2);
  });

  it("shuffled report order yields identical belief", () => {
    const reports = [
      { ts: 1, asset_id: "a", field: "x_km", value: 1 },
      { ts: 2, asset_id: "a", field: "y_km", value: 2 },
      { ts: 3, asset_id: "b", field: "x_km", value: 3 },
    ];
    const shuffled = [reports[2], reports[0], reports[1]];
    const b1 = ingestReports(reports);
    const b2 = ingestReports(shuffled);
    expect([...b1.entries()].sort()).toEqual([...b2.entries()].sort());
  });
});

describe("Simulator + ingest", () => {
  const timeline = new Map<number, Map<string, Partial<{ x_km: number; y_km: number; comms_up: boolean }>>>([
    [0, new Map([["uuv-1", { x_km: 0, y_km: 0 }]])],
    [1, new Map([["uuv-1", { x_km: 1, y_km: 0 }]])],
  ]);

  it("belief approximates truth while comms up", () => {
    const sim = new Simulator({ assets: [asset], timeline });
    let belief: Belief = new Map();
    for (const t of [0, 1]) {
      const { reports } = sim.tick(t);
      belief = ingestReports(reports, belief);
    }
    expect(getFact(belief, "uuv-1", "x_km")?.value).toBe(1);
    expect(getFact(belief, "uuv-1", "y_km")?.value).toBe(0);
  });

  it("drop toggle freezes that asset belief", () => {
    const simUp = new Simulator({ assets: [asset], timeline });
    let belief = ingestReports(simUp.tick(0).reports);
    belief = ingestReports(simUp.tick(1).reports, belief);
    expect(getFact(belief, "uuv-1", "x_km")?.value).toBe(1);

    const simDrop = new Simulator({
      assets: [asset],
      timeline: new Map<number, Map<string, Partial<{ x_km: number; comms_up: boolean }>>>([
        [0, new Map([["uuv-1", { x_km: 0, comms_up: true }]])],
        [1, new Map([["uuv-1", { x_km: 5, comms_up: false }]])],
      ]),
    });
    let frozen = ingestReports(simDrop.tick(0).reports);
    frozen = ingestReports(simDrop.tick(1).reports, frozen);
    expect(getFact(frozen, "uuv-1", "x_km")?.value).toBe(0);
  });
});

describe("mergeReportIntoBelief immutability", () => {
  it("does not mutate input belief", () => {
    const before: Belief = new Map();
    const after = mergeReportIntoBelief(before, {
      ts: 1,
      asset_id: "a",
      field: "x",
      value: 1,
    });
    expect(before.size).toBe(0);
    expect(after.size).toBe(1);
  });
});

describe("ingestReports pathDelay (D2)", () => {
  const twoHop = buildCommsModel([
    { from_id: "uuv-1", to_id: "relay", bandwidth_bps: 10_000, delay_s: 2, ts: 0 },
    { from_id: "relay", to_id: "operator", bandwidth_bps: 10_000, delay_s: 3, ts: 0 },
  ]);

  it("stores delivery ts on facts when comms graph has multi-hop delay", () => {
    const belief = ingestReports(
      [{ ts: 10, asset_id: "uuv-1", field: "x_km", value: 4 }],
      new Map(),
      { commsModel: twoHop }
    );
    expect(getFact(belief, "uuv-1", "x_km")?.ts).toBe(15);
  });

  it("holds reports until now reaches delivery ts", () => {
    const reports = [{ ts: 10, asset_id: "uuv-1", field: "x_km", value: 4 }];
    expect(
      getFact(ingestReports(reports, new Map(), { commsModel: twoHop, now: 12 }), "uuv-1", "x_km")
    ).toBeUndefined();
    expect(
      getFact(ingestReports(reports, new Map(), { commsModel: twoHop, now: 15 }), "uuv-1", "x_km")?.value
    ).toBe(4);
  });

  it("default staticCommsModel leaves ts unchanged (B2 guard)", () => {
    const belief = ingestReports([{ ts: 10, asset_id: "uuv-1", field: "x_km", value: 1 }]);
    expect(getFact(belief, "uuv-1", "x_km")?.ts).toBe(10);
  });
});
