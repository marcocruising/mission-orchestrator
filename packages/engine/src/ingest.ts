import type { Belief, Fact, FactSource } from "./types.js";
import { beliefKey } from "./types.js";
import { reconcile } from "./reconcile.js";
import type { CommsModel } from "./commsModel.js";
import { staticCommsModel } from "./commsModel.js";

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

export interface IngestOptions {
  /** Comms graph for multi-hop delivery latency (D2). Defaults to zero-delay stub. */
  commsModel?: CommsModel;
  operatorId?: string;
  /** Link snapshot ts — defaults to each report's sent ts. */
  queryTs?: number | ((sentTs: number) => number);
  /** When set, reports with delivery ts after `now` are held (not merged into belief). */
  now?: number;
}

const DEFAULT_OPERATOR_ID = "operator";

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

function deliveryTsForReport(
  report: Report,
  options: IngestOptions | undefined,
  comms: CommsModel
): number {
  const operatorId = options?.operatorId ?? DEFAULT_OPERATOR_ID;
  const queryTs =
    typeof options?.queryTs === "function"
      ? options.queryTs(report.ts)
      : (options?.queryTs ?? report.ts);
  return comms.messageDeliveryTs(report.ts, report.asset_id, operatorId, queryTs);
}

function reportAtDelivery(report: Report, deliveryTs: number): Report {
  return deliveryTs === report.ts ? report : { ...report, ts: deliveryTs };
}

/** Ingest reports in delivery-ts order; shuffled input yields identical belief (stable sort). */
export function ingestReports(
  reports: Report[],
  existing: Belief = new Map(),
  options?: IngestOptions
): Belief {
  const comms = options?.commsModel ?? staticCommsModel;
  const eligible = reports
    .map((r) => {
      const deliveryTs = deliveryTsForReport(r, options, comms);
      return reportAtDelivery(r, deliveryTs);
    })
    .filter((r) => options?.now === undefined || r.ts <= options.now);

  const sorted = [...eligible].sort(
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
