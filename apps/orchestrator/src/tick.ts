import {
  recomputeMissionStates,
  scanBelief,
  attachMissionToDisruptions,
  shouldAlert,
  summarize,
  generateCandidates,
  applyPlan,
  ingestReports,
  Simulator,
  type Asset,
  type MissionDef,
  type AssetSensor,
} from "@mission-orchestrator/engine";
import {
  createServiceClient,
  loadBelief,
  upsertBeliefFacts,
  insertReports,
  buildEngineInputFromDb,
  loadAssignments,
} from "@mission-orchestrator/db";

export interface TickResult {
  tick: number;
  missionStates: ReturnType<typeof recomputeMissionStates>;
  alerts: { shown: boolean; summary: string; mission_id: string; salience: number }[];
  topPlan: string | null;
}

export async function runTick(tick: number, simReports?: ReturnType<Simulator["tick"]>["reports"]): Promise<TickResult> {
  const client = createServiceClient();
  const now = tick;

  if (simReports) {
    await insertReports(client, simReports);
  }

  let belief = await loadBelief(client);
  if (simReports?.length) {
    belief = ingestReports(simReports, belief);
    await upsertBeliefFacts(client, belief);
  }

  const input = await buildEngineInputFromDb(client, now);
  const states = recomputeMissionStates(input, tick);

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

export const DEMO_ASSETS: Asset[] = [
  { id: "uuv-alpha", kind: "UUV", domain: "subsurface", depth_rating_m: 300, top_speed_kn: 8, gps_dependent: false },
  { id: "usv-bravo", kind: "USV", domain: "surface", depth_rating_m: 0, top_speed_kn: 25, gps_dependent: true },
];

export const DEMO_SENSORS: AssetSensor[] = [
  { asset_id: "uuv-alpha", sensor: "passive_acoustic", base_quality: 0.9, max_range_km: 10, k_motion: 1.6 },
  { asset_id: "usv-bravo", sensor: "eo_ir", base_quality: 0.85, max_range_km: 15, k_motion: 0.36 },
  { asset_id: "usv-bravo", sensor: "passive_acoustic", base_quality: 0.7, max_range_km: 8, k_motion: 1.6 },
];

export const DEMO_MISSIONS: MissionDef[] = [
  {
    id: "mission-track",
    name: "Submarine Track",
    priority: 0.9,
    tasks: [
      {
        id: "task-track",
        mission_id: "mission-track",
        w_t: 1,
        target_x: 2,
        target_y: 0,
        target_depth_m: 50,
        window_end_s: 3600,
        demands: [{ sensor: "passive_acoustic", min_quality: 0.5 }],
        constraints: [{ kind: "domain", param: { domain: "subsurface" } }],
      },
    ],
  },
  {
    id: "mission-patrol",
    name: "Surface Patrol",
    priority: 0.4,
    tasks: [
      {
        id: "task-patrol",
        mission_id: "mission-patrol",
        w_t: 1,
        target_x: 5,
        target_y: 2,
        target_depth_m: 0,
        window_end_s: null,
        demands: [{ sensor: "eo_ir", min_quality: 0.4 }],
        constraints: [],
      },
    ],
  },
];
