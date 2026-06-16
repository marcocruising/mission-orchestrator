import { Simulator } from "@mission-orchestrator/engine";
import { createServiceClient } from "@mission-orchestrator/db";
import { runTick, applyTopPlan, type TickResult } from "./tick.js";
import { runEnvFetch } from "./env-fetch.js";
import {
  DEMO_ASSETS,
  buildDemoTimeline,
  SCENARIO_META,
  OFFSHORE_COV_BASELINES,
} from "./scenarios/offshore-pipeline.js";

export const SCENARIO_MAX_TICK = 8;

export const TICK_LABELS: Record<number, string> = {
  0: "Fleet on station — patrol begins",
  1: "USV-A + UUV sweep east along pipeline",
  2: "Volume cells start turning green",
  3: "UUV link fails subsea (operator not yet aware)",
  4: "Delayed link-down arrives — search ellipse blooms",
  5: "Pipeline confidence drops — alerts expected",
  6: "UUV still dark; USV continues alone",
  7: "Subsea link restored (operator learns next tick)",
  8: "UUV back on net — full patrol resumes",
};

/** Anchor sticky cov_baseline after reset so salience/impact use demo targets (0.85 / 0.9). */
async function seedCovBaselines(): Promise<void> {
  const client = createServiceClient();
  for (const [mission_id, cov_baseline] of OFFSHORE_COV_BASELINES) {
    const { error } = await client.from("mission_state").upsert({
      mission_id,
      tick: 0,
      cov_baseline,
      cov_now: cov_baseline,
      tier: "FULL",
      confidence: 1,
      time_to_act_s: 600,
      impact: 0,
      urgency: 0,
      salience: 0,
    });
    if (error) throw error;
  }
}

async function ensureCovBaselines(): Promise<void> {
  const client = createServiceClient();
  const { count, error } = await client
    .from("mission_state")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  if ((count ?? 0) === 0) await seedCovBaselines();
}

function simulator() {
  return new Simulator({ assets: DEMO_ASSETS, timeline: buildDemoTimeline() });
}

/** Clear tick-derived rows so the scenario can be replayed from tick 0. */
export async function resetScenarioRuntime(): Promise<void> {
  const client = createServiceClient();
  const tables = [
    () => client.from("task_volume_visits").delete().gte("task_id", ""),
    () => client.from("plan_eval").delete().gte("plan_id", ""),
    () => client.from("candidate_plans").delete().gte("plan_id", ""),
    () => client.from("alert_log").delete().gte("ts", 0),
    () => client.from("decision_log").delete().gte("ts", 0),
    () => client.from("mission_state").delete().gte("tick", 0),
    () => client.from("belief_facts").delete().gte("ts", 0),
    () => client.from("reports").delete().gte("ts", 0),
    () => client.from("world_truth").delete().gte("tick", 0),
  ];
  for (const run of tables) {
    const { error } = await run();
    if (error) throw error;
  }
}

export async function getCurrentTick(): Promise<number> {
  const client = createServiceClient();
  const { data } = await client
    .from("mission_state")
    .select("tick")
    .order("tick", { ascending: false })
    .limit(1);
  if (data?.[0]?.tick != null) return Number(data[0].tick);

  const { data: facts } = await client
    .from("belief_facts")
    .select("ts")
    .order("ts", { ascending: false })
    .limit(1);
  return facts?.[0]?.ts != null ? Number(facts[0].ts) : -1;
}

export async function runScenarioTick(tick: number): Promise<TickResult> {
  if (tick === 0) await ensureCovBaselines();
  const { reports } = simulator().tick(tick);
  return runTick(tick, reports);
}

/** Advance one tick from the current DB state (no reset). */
export async function advanceOneTick(): Promise<{ tick: number; result: TickResult }> {
  const current = await getCurrentTick();
  const next = current + 1;
  if (next > SCENARIO_MAX_TICK) {
    throw new Error(`Already at final tick (${SCENARIO_MAX_TICK})`);
  }
  const result = await runScenarioTick(next);
  return { tick: next, result };
}

/** Reset runtime tables, then replay ticks 0…target inclusive. */
export async function replayToTick(target: number): Promise<{ tick: number; results: TickResult[] }> {
  if (target < -1 || target > SCENARIO_MAX_TICK) {
    throw new Error(`Tick must be between -1 and ${SCENARIO_MAX_TICK}`);
  }
  await resetScenarioRuntime();
  if (target < 0) return { tick: -1, results: [] };

  await seedCovBaselines();

  try {
    await runEnvFetch({ allTicks: true });
  } catch (err) {
    console.warn("env-fetch skipped:", err instanceof Error ? err.message : err);
  }

  const results: TickResult[] = [];
  for (let t = 0; t <= target; t++) {
    results.push(await runScenarioTick(t));
  }
  return { tick: target, results };
}

export function scenarioInfo() {
  return {
    id: SCENARIO_META.id,
    name: SCENARIO_META.name,
    maxTick: SCENARIO_MAX_TICK,
    ticks: Array.from({ length: SCENARIO_MAX_TICK + 1 }, (_, n) => ({
      tick: n,
      label: TICK_LABELS[n] ?? `Tick ${n}`,
    })),
  };
}

export async function applyScenarioPlan(planId: string, tick?: number): Promise<void> {
  const t = tick ?? (await getCurrentTick());
  if (t < 0) throw new Error("Run at least one tick before applying a plan");
  await applyTopPlan(planId, t);
}
