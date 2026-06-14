#!/usr/bin/env node
import "../../../scripts/load-env.mjs";
import {
  Simulator,
  ingestReports,
  beliefToFacts,
  recomputeMissionStates,
  buildEngineInput,
  defaultResolveSpeed,
} from "@mission-orchestrator/engine";
import {
  createServiceClient,
  loadBelief,
  upsertBeliefFacts,
  insertReports,
  insertWorldTruth,
  buildEngineInputFromDb,
} from "@mission-orchestrator/db";
import { DEMO_ASSETS, DEMO_MISSIONS, DEMO_SENSORS, runTick, applyTopPlan } from "./tick.js";

function buildDemoTimeline() {
  const timeline = new Map<number, Map<string, Partial<{ x_km: number; y_km: number; comms_up: boolean; speed_kn: number }>>>();
  timeline.set(0, new Map([
    ["uuv-alpha", { x_km: 0, y_km: 0, speed_kn: 6 }],
    ["usv-bravo", { x_km: 5, y_km: 2 }],
  ]));
  timeline.set(1, new Map([
    ["uuv-alpha", { x_km: 0.5, y_km: 0, speed_kn: 7 }],
    ["usv-bravo", { x_km: 5.2, y_km: 2.1 }],
  ]));
  timeline.set(2, new Map([
    ["uuv-alpha", { x_km: 1, y_km: 0, speed_kn: 7, comms_up: false }],
    ["usv-bravo", { x_km: 5.5, y_km: 2.2 }],
  ]));
  return timeline;
}

async function inspectLocal(tick: number): Promise<void> {
  const sim = new Simulator({ assets: DEMO_ASSETS, timeline: buildDemoTimeline() });
  let belief = new Map<string, import("@mission-orchestrator/engine").Fact>();
  for (let t = 0; t <= tick; t++) {
    const { reports } = sim.tick(t);
    belief = ingestReports(reports, belief);
  }
  printBelief(beliefToFacts(belief), tick);

  const input = buildEngineInput({
    belief,
    assets: DEMO_ASSETS,
    sensors: DEMO_SENSORS,
    missions: DEMO_MISSIONS,
    assignments: [
      { id: "a1", asset_id: "uuv-alpha", task_id: "task-track", operating_point: "FAST", issued_ts: 0 },
      { id: "a2", asset_id: "usv-bravo", task_id: "task-patrol", operating_point: "FAST", issued_ts: 0 },
    ],
    now: tick,
    covBaselines: new Map([["mission-track", 0.95], ["mission-patrol", 0.8]]),
    resolveSpeed: defaultResolveSpeed,
  });
  const states = recomputeMissionStates(input, tick);
  console.log("\n=== Mission state ===");
  for (const s of states) {
    console.log(`  ${s.mission_id}: tier=${s.tier} cov=${(s.cov_now * 100).toFixed(0)}% conf=${(s.confidence * 100).toFixed(0)}% salience=${s.salience.toFixed(2)}`);
  }
}

async function inspectDb(): Promise<void> {
  const client = createServiceClient();
  const belief = await loadBelief(client);
  printBelief([...belief.values()], -1);
  const input = await buildEngineInputFromDb(client, Math.floor(Date.now() / 1000));
  const states = recomputeMissionStates(input, 0);
  console.log("\n=== Mission state (DB) ===");
  for (const s of states) {
    console.log(`  ${s.mission_id}: tier=${s.tier} cov=${(s.cov_now * 100).toFixed(0)}%`);
  }
}

function printBelief(facts: import("@mission-orchestrator/engine").Fact[], tick: number): void {
  console.log(`=== Believed fleet ${tick >= 0 ? `@ tick ${tick}` : "(from DB)"} ===`);
  const byAsset = new Map<string, Record<string, unknown>>();
  for (const f of facts) {
    if (!byAsset.has(f.asset_id)) byAsset.set(f.asset_id, {});
    byAsset.get(f.asset_id)![f.field] = f.value;
  }
  for (const [id, fields] of byAsset) {
    const pos = fields.x_km !== undefined
      ? `(${fields.x_km}, ${fields.y_km}, depth=${fields.depth_m ?? 0})`
      : "(no position)";
    console.log(`  ${id}: ${pos} battery=${fields.battery_pct ?? "?"}% comms=${fields.comms_up ?? "?"}`);
  }
}

async function simTick(tick: number): Promise<void> {
  const client = createServiceClient();
  const sim = new Simulator({ assets: DEMO_ASSETS, timeline: buildDemoTimeline() });
  const { truth, reports } = sim.tick(tick);
  await insertWorldTruth(client, truth);
  await insertReports(client, reports);
  const existing = await loadBelief(client);
  const belief = ingestReports(reports, existing);
  await upsertBeliefFacts(client, belief);
  console.log(`Sim tick ${tick}: ${reports.length} reports ingested`);
}

async function main(): Promise<void> {
  const [cmd, arg, arg2] = process.argv.slice(2);
  switch (cmd) {
    case "inspect":
      if (process.env.SUPABASE_URL) {
        await inspectDb();
      } else {
        await inspectLocal(Number(arg ?? 1));
      }
      break;
    case "sim":
      await simTick(Number(arg ?? 0));
      break;
    case "tick":
      if (!process.env.SUPABASE_URL) {
        console.error("tick requires SUPABASE_URL — use inspect for local demo");
        process.exit(1);
      }
      {
        const sim = new Simulator({ assets: DEMO_ASSETS, timeline: buildDemoTimeline() });
        const t = Number(arg ?? 0);
        const { reports } = sim.tick(t);
        const result = await runTick(t, reports);
        console.log(`Tick ${t}: ${result.missionStates.length} missions, top plan: ${result.topPlan ?? "none"}`);
        for (const a of result.alerts) console.log(`  Alert [${a.shown ? "SHOWN" : "logged"}]: ${a.summary}`);
      }
      break;
    case "apply":
      if (!process.env.SUPABASE_URL) {
        console.error("apply requires SUPABASE_URL");
        process.exit(1);
      }
      await applyTopPlan(arg!, Number(arg2 ?? 0));
      console.log(`Applied plan ${arg}`);
      break;
    default:
      console.log("Usage:");
      console.log("  orchestrator inspect [tick]  — believed fleet + mission tiers");
      console.log("  orchestrator sim <tick>      — ingest sim reports to Supabase");
      console.log("  orchestrator tick <tick>     — full loop: ingest → state → monitor → plan");
      console.log("  orchestrator apply <planId> [tick]");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
