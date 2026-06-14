#!/usr/bin/env node
/**
 * B3 guard: planner must treat operating_point as opaque — no JSON.parse / bearing branches.
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PLANNER = join(
  fileURLToPath(new URL("../packages/engine/src/planner.ts", import.meta.url))
);

const FORBIDDEN = [
  { re: /JSON\.parse\s*\([^)]*operating_point/, msg: "must not JSON.parse operating_point" },
  { re: /operating_point[^;\n]*bearing/, msg: "must not branch on bearing in operating_point" },
  { re: /\.bearing_deg/, msg: "must not read bearing_deg in planner" },
];

const content = readFileSync(PLANNER, "utf8");
const rel = relative(process.cwd(), PLANNER);
const violations = FORBIDDEN.filter(({ re }) => re.test(content)).map(
  ({ msg }) => `${rel}: ${msg}`
);

if (violations.length > 0) {
  console.error("Planner opaque-handle guard FAILED:\n");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("Planner opaque-handle guard passed.");
process.exit(0);
