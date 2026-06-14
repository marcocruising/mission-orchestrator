#!/usr/bin/env node
/**
 * B1 guard: computeMissionCoverage rollup must stay leaf-agnostic —
 * only w_t + computeTaskLeaf dispatch; no point-only task fields.
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const STATE_ENGINE = join(
  fileURLToPath(new URL("../packages/engine/src/stateEngine.ts", import.meta.url))
);

/** Fields that belong inside leaf bodies, not mission rollup. */
const FORBIDDEN_IN_ROLLUP = [
  { re: /\btask\.target_x\b/, msg: "must not read task.target_x" },
  { re: /\btask\.target_y\b/, msg: "must not read task.target_y" },
  { re: /\btask\.target_depth_m\b/, msg: "must not read task.target_depth_m" },
  { re: /\btask\.demands\b/, msg: "must not read task.demands" },
  { re: /\btask\.kind\b/, msg: "must not read task.kind" },
  { re: /\btask\.constraints\b/, msg: "must not read task.constraints" },
  { re: /\beffectiveQuality\b/, msg: "must not call effectiveQuality" },
  { re: /\bcomputePointTaskLeaf\b/, msg: "must not call computePointTaskLeaf directly" },
];

function extractFunctionBody(source, name) {
  const marker = `export function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`function ${name} not found`);

  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) throw new Error(`function ${name} has no body`);

  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(braceStart + 1, i);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

const source = readFileSync(STATE_ENGINE, "utf8");
const rollupBody = extractFunctionBody(source, "computeMissionCoverage");
const rel = relative(process.cwd(), STATE_ENGINE);
const violations = [];

for (const { re, msg } of FORBIDDEN_IN_ROLLUP) {
  if (re.test(rollupBody)) violations.push(`${rel} computeMissionCoverage: ${msg}`);
}

if (violations.length > 0) {
  console.error("Rollup leaf-agnostic guard FAILED:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Rollup leaf-agnostic guard passed.");
process.exit(0);
