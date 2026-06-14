import { describe, it, expect } from "vitest";
import {
  summarize,
  templateSummarizer,
  type MissionSummaryState,
  type Summarizer,
} from "./summarize.js";

const fixture: MissionSummaryState = {
  mission_id: "mission-track",
  tier: "AT_RISK",
  cov_now: 0.4,
  cov_baseline: 0.9,
  impact: 0.45,
  salience: 0.5,
};

describe("summarize (A0.6 — v1 template body, swappable summarizer)", () => {
  it("renders coverage percentages from numeric state, not hardcoded strings", () => {
    const text = summarize(fixture);
    expect(text).toContain("coverage 40%");
    expect(text).toContain("baseline 90%");
    expect(text).not.toContain("coverage 0.4%");
  });

  it("matches golden template output for a fixed mission state row", () => {
    expect(summarize(fixture)).toBe(
      "[ALERT] Mission mission-track: tier AT_RISK, coverage 40% (baseline 90%), impact 0.45, salience 0.50"
    );
  });

  it("templateSummarizer is the default body", () => {
    expect(summarize(fixture)).toBe(templateSummarizer(fixture));
  });

  it("swapping summarizer changes output without touching call sites", () => {
    const stub: Summarizer = (s) => `STUB:${s.mission_id}:${s.tier}`;
    expect(summarize(fixture, stub)).toBe("STUB:mission-track:AT_RISK");
  });

  it("stub summarizer that returns empty still satisfies the string contract", () => {
    expect(summarize(fixture, () => "")).toBe("");
  });

  it("impact and salience use two decimal places", () => {
    const text = summarize({
      ...fixture,
      impact: 0.1,
      salience: 0.333,
    });
    expect(text).toContain("impact 0.10");
    expect(text).toContain("salience 0.33");
  });
});
