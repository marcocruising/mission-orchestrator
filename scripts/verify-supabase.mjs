#!/usr/bin/env node
import "./load-env.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

console.log("Project:", url);

const service = createClient(url, serviceKey);
const anon = anonKey ? createClient(url, anonKey) : null;

const tables = [
  "config",
  "assets",
  "asset_sensors",
  "belief_facts",
  "missions",
  "tasks",
  "assignments",
  "mission_state",
  "alert_log",
  "plan_eval",
];

let ok = 0;
let missing = 0;

for (const table of tables) {
  const { error } = await service.from(table).select("*").limit(1);
  if (error) {
    console.log(`  ✗ ${table}: ${error.message}`);
    missing++;
  } else {
    console.log(`  ✓ ${table}: reachable`);
    ok++;
  }
}

if (anon) {
  const { error } = await anon.from("config").select("key").limit(1);
  console.log(anon ? `\nAnon key + RLS: ${error ? "✗ " + error.message : "✓ config readable"}` : "");
}

console.log(`\nSummary: ${ok}/${tables.length} tables ready`);
if (missing > 0) {
  console.log("\nSchema not applied yet. Run: pnpm db:setup");
  console.log("(Requires DATABASE_URL in .env — Supabase Dashboard → Database → Connection string URI)");
  process.exit(1);
}

console.log("\nSupabase connection OK — schema is ready.");
process.exit(0);
