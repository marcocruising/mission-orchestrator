#!/usr/bin/env node
import "../../../scripts/load-env.mjs";
import {
  Simulator,
  ingestReports,
  beliefToFacts,
  recomputeMissionStates,
  buildEngineInput,
} from "@mission-orchestrator/engine";
import {
  createServiceClient,
  loadBelief,
  upsertBeliefFacts,
  insertReports,
  insertWorldTruth,
  loadReportsUpTo,
  loadCommsModel,
  buildEngineInputFromDb,
} from "@mission-orchestrator/db";
import { runTick, applyTopPlan } from "./tick.js";
import { runEnvFetch } from "./env-fetch.js";
import {
  DEMO_ASSETS,
  DEMO_MISSIONS,
  DEMO_SENSORS,
  DEMO_ASSIGNMENTS,
  DEMO_COV_BASELINES,
  buildDemoTimeline,
  SCENARIO_META,
  SCENARIO_COMMS_MODEL,
} from "./scenarios/offshore-pipeline.js";

async function inspectLocal(tick: number): Promise<void> {
  const sim = new Simulator({ assets: DEMO_ASSETS, timeline: buildDemoTimeline() });
  const accumulated: import("@mission-orchestrator/engine").Report[] = [];
  let belief = new Map<string, import("@mission-orchestrator/engine").Fact>();
  for (let t = 0; t <= tick; t++) {
    const { reports } = sim.tick(t);
    accumulated.push(...reports);
    belief = ingestReports(accumulated, new Map(), {
      commsModel: SCENARIO_COMMS_MODEL,
      now: t,
      queryTs: (sent) => sent,
    });
  }
  printBelief(beliefToFacts(belief), tick);

  const input = buildEngineInput({
    belief,
    assets: DEMO_ASSETS,
    sensors: DEMO_SENSORS,
    missions: DEMO_MISSIONS,
    assignments: DEMO_ASSIGNMENTS,
    now: tick,
    covBaselines: DEMO_COV_BASELINES,
  });
  const states = recomputeMissionStates(input, tick);
  console.log("\n=== Mission state ===");
  for (const s of states) {
    console.log(
      `  ${s.mission_id}: tier=${s.tier} cov=${(s.cov_now * 100).toFixed(0)}% conf=${(s.confidence * 100).toFixed(0)}% salience=${s.salience.toFixed(2)}`
    );
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
    const z =
      typeof fields.z_m === "number"
        ? `alt=${fields.z_m}m`
        : fields.x_km !== undefined
          ? `depth=${fields.depth_m ?? 0}m`
          : "";
    const pos =
      fields.x_km !== undefined ? `(${fields.x_km}, ${fields.y_km}, ${z})` : "(no position)";
    console.log(`  ${id}: ${pos} battery=${fields.battery_pct ?? "?"}% comms=${fields.comms_up ?? "?"}`);
  }
}

async function simTick(tick: number): Promise<void> {
  const client = createServiceClient();
  const sim = new Simulator({ assets: DEMO_ASSETS, timeline: buildDemoTimeline() });
  const { truth, reports } = sim.tick(tick);
  await insertWorldTruth(client, truth);
  await insertReports(client, reports);
  const commsModel = await loadCommsModel(client, tick);
  const allReports = await loadReportsUpTo(client, tick);
  const belief = ingestReports(allReports, new Map(), { commsModel, now: tick, queryTs: (sent) => sent });
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
        await inspectLocal(Number(arg ?? 3));
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
    case "scenario":
      console.log(JSON.stringify(SCENARIO_META, null, 2));
      break;
    case "env-fetch": {
      if (!process.env.SUPABASE_URL) {
        console.error("env-fetch requires SUPABASE_URL");
        process.exit(1);
      }
      const allTicks = arg === "--all-ticks";
      const tick = allTicks ? undefined : Number(arg ?? 0);
      const skipCopernicus = process.argv.includes("--skip-copernicus");
      const result = await runEnvFetch({ tick, allTicks, skipCopernicus });
      for (const r of result.results) {
        console.log(
          `Tick ${r.tick}: ${r.samples.length} samples (Open-Meteo ${r.sources.openMeteo}, Copernicus ${r.sources.copernicus}) @ ${new Date(r.targetEpochS * 1000).toISOString()}`
        );
      }
      console.log(`Upserted ${result.totalRows} rows into environment_samples`);
      break;
    }
    default:
      console.log("Usage:");
      console.log("  orchestrator inspect [tick]  — believed fleet + mission tiers");
      console.log("  orchestrator sim <tick>      — ingest sim reports to Supabase");
      console.log("  orchestrator tick <tick>     — full loop: ingest → state → monitor → plan");
      console.log("  orchestrator apply <planId> [tick]");
      console.log("  orchestrator scenario        — print offshore scenario metadata");
      console.log("  orchestrator env-fetch [tick] | --all-ticks  — import Open-Meteo + Copernicus → environment_samples");
      console.log("      --skip-copernicus        — Open-Meteo only (no Python/Copernicus)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
