import type { Belief, Fact, FactSource } from "./types.js";
import { beliefKey } from "./types.js";
import { reconcile } from "./reconcile.js";

export interface Report {
  ts: number;
  asset_id: string;
  field: string;
  value: unknown;
  source?: FactSource;
  confidence?: number;
  half_life_s?: number;
}

export interface IngestDefaults {
  source: FactSource;
  confidence: number;
  half_life_s: number;
}

const DEFAULTS: IngestDefaults = {
  source: "telemetry",
  confidence: 1,
  half_life_s: 120,
};

export function reportToFact(report: Report, defaults: IngestDefaults = DEFAULTS): Fact {
  return {
    asset_id: report.asset_id,
    field: report.field,
    value: report.value,
    ts: report.ts,
    source: report.source ?? defaults.source,
    confidence: report.confidence ?? defaults.confidence,
    half_life_s: report.half_life_s ?? defaults.half_life_s,
  };
}

/** Merge a single report into belief via reconcile (immutable). */
export function mergeReportIntoBelief(
  belief: Belief,
  report: Report,
  defaults: IngestDefaults = DEFAULTS
): Belief {
  const key = beliefKey(report.asset_id, report.field);
  const existing = belief.get(key);
  const incoming = reportToFact(report, defaults);
  const merged = reconcile(existing, incoming);
  if (existing && merged === existing) return belief;

  const next = new Map(belief);
  next.set(key, merged);
  return next;
}

/** Ingest reports in ts order; shuffled input yields identical belief (stable sort). */
export function ingestReports(reports: Report[], existing: Belief = new Map()): Belief {
  const sorted = [...reports].sort(
    (a, b) =>
      a.ts - b.ts ||
      a.asset_id.localeCompare(b.asset_id) ||
      a.field.localeCompare(b.field)
  );
  return sorted.reduce((b, r) => mergeReportIntoBelief(b, r), existing);
}

/** Convert Belief map to plain Fact array. */
export function beliefToFacts(belief: Belief): Fact[] {
  return [...belief.values()];
}
