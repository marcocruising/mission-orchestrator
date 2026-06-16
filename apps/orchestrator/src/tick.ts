import {
  recomputeMissionStatesWithVisits,
  scanBelief,
  attachMissionToDisruptions,
  shouldAlert,
  summarize,
  generateCandidates,
  applyPlan,
  ingestReports,
  Simulator,
} from "@mission-orchestrator/engine";
import {
  createServiceClient,
  upsertBeliefFacts,
  insertReports,
  loadReportsUpTo,
  loadCommsModel,
  buildEngineInputFromDb,
  loadAssignments,
  upsertVolumeVisits,
} from "@mission-orchestrator/db";

export interface TickResult {
  tick: number;
  missionStates: ReturnType<typeof recomputeMissionStatesWithVisits>["states"];
  alerts: { shown: boolean; summary: string; mission_id: string; salience: number }[];
  topPlan: string | null;
}

export async function runTick(tick: number, simReports?: ReturnType<Simulator["tick"]>["reports"]): Promise<TickResult> {
  const client = createServiceClient();
  const now = tick;

  if (simReports) {
    await insertReports(client, simReports);
  }

  const commsModel = await loadCommsModel(client, now);
  const reports = await loadReportsUpTo(client, now);
  const belief = ingestReports(reports, new Map(), { commsModel, now, queryTs: (sent) => sent });
  if (reports.length > 0) {
    await upsertBeliefFacts(client, belief);
  }

  const input = await buildEngineInputFromDb(client, now);
  const { states, volumeVisits } = recomputeMissionStatesWithVisits(input, tick);

  for (const s of states) {
    await client.from("mission_state").upsert({
      mission_id: s.mission_id,
      tick: s.tick,
      cov_baseline: s.cov_baseline,
      cov_now: s.cov_now,
      tier: s.tier,
      confidence: s.confidence,
      time_to_act_s: s.time_to_act_s,
      impact: s.impact,
      urgency: s.urgency,
      salience: s.salience,
    });
  }

  await upsertVolumeVisits(client, volumeVisits);

  const assignments = await loadAssignments(client);
  const assetMission = new Map<string, string>();
  for (const asn of assignments) {
    const task = input.missions.flatMap((m) => m.tasks).find((t) => t.id === asn.task_id);
    if (task) assetMission.set(asn.asset_id, task.mission_id);
  }

  const disruptions = attachMissionToDisruptions(scanBelief(belief, now), assetMission);
  const alerts: TickResult["alerts"] = [];

  for (const s of states.filter((x) => shouldAlert(x.salience, input.config.sigma))) {
    const summary = summarize(s);
    const shown = s.salience >= input.config.sigma;
    alerts.push({ shown, summary, mission_id: s.mission_id, salience: s.salience });
    await client.from("alert_log").insert({
      ts: now,
      mission_id: s.mission_id,
      salience: s.salience,
      tier_change: s.tier,
      summary_text: summary,
      shown,
    });
  }

  let topPlan: string | null = null;
  if (alerts.some((a) => a.shown)) {
    const affected = [...new Set(alerts.filter((a) => a.shown).map((a) => a.mission_id))];
    const baseline = Object.fromEntries(states.map((s) => [s.mission_id, s.cov_now]));
    const evals = generateCandidates(input, affected, baseline);
    for (const ev of evals.slice(0, 5)) {
      await client.from("candidate_plans").upsert({
        plan_id: ev.plan_id,
        disruption_id: disruptions[0]?.id ?? `d-${tick}`,
        moves: [],
        n_moves: ev.n_moves,
      });
      await client.from("plan_eval").upsert({
        plan_id: ev.plan_id,
        cov_by_mission: ev.cov_by_mission,
        objective: ev.objective,
        total_exposure: ev.total_exposure,
        cascades: ev.cascades,
        assumptions: ev.assumptions,
      });
    }
    topPlan = evals[0]?.plan_id ?? null;
  }

  return { tick, missionStates: states, alerts, topPlan };
}

export async function applyTopPlan(planId: string, tick: number): Promise<void> {
  const client = createServiceClient();
  const input = await buildEngineInputFromDb(client, tick);
  const { data: planRow } = await client.from("candidate_plans").select("*").eq("plan_id", planId).single();
  const moves = (planRow?.moves ?? []) as import("@mission-orchestrator/engine").PlanMove[];
  const result = applyPlan({ plan_id: planId, moves }, input, tick, tick);
  if (!result.ok) throw new Error(result.reason);

  for (const asn of result.assignments ?? []) {
    await client.from("assignments").upsert(asn);
  }
  await client.from("decision_log").insert({
    ts: tick,
    disruption_id: planRow?.disruption_id ?? "manual",
    plans_shown: [planId],
    chosen_plan_id: planId,
    operator: "operator",
  });

  await runTick(tick);
}

export {
  DEMO_ASSETS,
  DEMO_SENSORS,
  DEMO_MISSIONS,
  DEMO_ASSIGNMENTS,
  DEMO_COV_BASELINES,
  buildDemoTimeline,
  SCENARIO_META,
} from "./scenarios/offshore-pipeline.js";
