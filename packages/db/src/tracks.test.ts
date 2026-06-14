import { describe, it, expect } from "vitest";
import { ESTIMATE_STATE_DIM } from "@mission-orchestrator/engine";
import { parseTrackRow } from "./tracks.js";
import type { TrackRow } from "@mission-orchestrator/engine";

describe("tracks loader", () => {
  it("parseTrackRow migrates legacy 4D estimate JSON to cv6", () => {
    const row = {
      id: "contact-1",
      estimate: {
        mean: [2, 3, 0, 0],
        cov: [
          [0.25, 0, 0, 0],
          [0, 0.25, 0, 0],
          [0, 0, 1e-6, 0],
          [0, 0, 0, 1e-6],
        ],
        ts: 100,
      },
      last_updated: 100,
      contributing: ["uuv-alpha"],
      classification: null,
    };
    const track = parseTrackRow(row as unknown as TrackRow);
    expect(track.estimate.layout).toBe("cv6");
    expect(track.estimate.mean.length).toBe(ESTIMATE_STATE_DIM);
    expect(track.estimate.cov.length).toBe(ESTIMATE_STATE_DIM);
  });
});
