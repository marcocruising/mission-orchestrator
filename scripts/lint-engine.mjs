#!/usr/bin/env node
/**
 * CI guardrail: packages/engine must stay pure — no DB imports, no world_truth.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE_SRC = join(fileURLToPath(new URL("../packages/engine/src", import.meta.url)));

const FORBIDDEN_PATTERNS = [
  { re: /@supabase\/supabase-js/, msg: "must not import @supabase/supabase-js" },
  { re: /@mission-orchestrator\/db/, msg: "must not import @mission-orchestrator/db" },
  { re: /from\s+['"]pg['"]/, msg: "must not import pg" },
  { re: /world_truth/, msg: "must not reference world_truth" },
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry) && !entry.endsWith(".test.ts")) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];

for (const file of walk(ENGINE_SRC)) {
  const content = readFileSync(file, "utf8");
  const rel = relative(process.cwd(), file);
  for (const { re, msg } of FORBIDDEN_PATTERNS) {
    if (re.test(content)) {
      violations.push(`${rel}: ${msg}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Engine purity guardrail FAILED:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Engine purity guardrail passed.");
