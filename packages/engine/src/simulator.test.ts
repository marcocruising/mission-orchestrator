import { describe, it, expect } from "vitest";
import { Simulator } from "./simulator.js";
import type { Asset } from "./types.js";

describe("Simulator", () => {
  const assets: Asset[] = [
    { id: "uuv-1", kind: "UUV", domain: "subsurface", depth_rating_m: 300, top_speed_kn: 6, gps_dependent: false },
    { id: "uav-1", kind: "UAV", domain: "air", depth_rating_m: 5000, top_speed_kn: 40, gps_dependent: true },
  ];

  it("emits depth_m for subsurface assets and z_m for air assets", () => {
    const timeline = new Map([
      [
        0,
        new Map([
          ["uuv-1", { x_km: 1, y_km: 2, depth_m: 60 }],
          ["uav-1", { x_km: 3, y_km: 4, z_m: 500 }],
        ]),
      ],
    ]);
    const sim = new Simulator({ assets, timeline });
    const { reports } = sim.tick(0);
    expect(reports.some((r) => r.asset_id === "uuv-1" && r.field === "depth_m" && r.value === 60)).toBe(true);
    expect(reports.some((r) => r.asset_id === "uav-1" && r.field === "z_m" && r.value === 500)).toBe(true);
    expect(reports.some((r) => r.asset_id === "uav-1" && r.field === "depth_m")).toBe(false);
  });

  it("emits link-down comms_up report when comms are down but skips telemetry", () => {
    const timeline = new Map([
      [0, new Map([["uuv-1", { x_km: 1, comms_up: true }]])],
      [1, new Map([["uuv-1", { x_km: 9, comms_up: false }]])],
    ]);
    const sim = new Simulator({ assets: [assets[0]], timeline });
    const down = sim.tick(1).reports;
    expect(down).toEqual([
      { ts: 1, asset_id: "uuv-1", field: "comms_up", value: false },
    ]);
  });
});
