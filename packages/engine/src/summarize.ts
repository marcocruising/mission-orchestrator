/** Subset of MissionStateRow passed to alert narration (P8 — LLM writes prose only). */
export interface MissionSummaryState {
  mission_id: string;
  tier: string;
  cov_now: number;
  cov_baseline: number;
  impact: number;
  salience: number;
}

/** Seam for swapping template → LLM body (S13 / D5). */
export type Summarizer = (state: MissionSummaryState) => string;

/** v1 body: deterministic template string from computed MissionState fields. */
export function templateSummarizer(state: MissionSummaryState): string {
  return (
    `[ALERT] Mission ${state.mission_id}: tier ${state.tier}, ` +
    `coverage ${(state.cov_now * 100).toFixed(0)}% (baseline ${(state.cov_baseline * 100).toFixed(0)}%), ` +
    `impact ${state.impact.toFixed(2)}, salience ${state.salience.toFixed(2)}`
  );
}

/** Single entry point for alert summary_text — computes nothing, narrates only. */
export function summarize(
  state: MissionSummaryState,
  summarizer: Summarizer = templateSummarizer
): string {
  return summarizer(state);
}
