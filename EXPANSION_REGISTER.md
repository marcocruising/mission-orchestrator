# Expansion Register — Mission Orchestrator

**Status:** S0–S10 complete · **Phase A0 complete (A0.1–A0.8)** · A1–A4 + B–D pending

This replaces the flat Deferred register in [README.md](README.md). Every expansion is classified by
**what it requires of the architecture**, because the deferral rule is different for each tier.

---

## Current state (honest)

The original freeze gate (before S4) was not run. S4–S10 shipped on a scalar-`Fact` belief model,
hardcoded `envMult`, last-write-by-ts ingest, and an ad-hoc UI search ellipse. That is fine for the
demo loop, but several future features are **rewrites today**, not body swaps.

This register merges:

- the original three-tier framework,
- the post-S10 gap analysis,
- upcoming **imported data** (wind, sea currents, salinity, sea state, comms link budgets / delays),

into one ordered plan: **structural shapes and seams first → guard tests → Tier 3 bodies → Tier 1 bodies**.

### Progress log (Phase A0 seam retrofits)

| Step | Module | Status | Notes |
|------|--------|--------|-------|
| **A0.1** | `reconcile.ts` | ✅ Done | Ingest routes all merges through `reconcile()`; v1 = newer ts wins, confidence passthrough |
| **A0.2** | `envMult.ts` | ✅ Done | Product over `EnvFactor[]`; `DEFAULT_ENV_FACTORS = [motionEnvFactor]` |
| **A0.3** | `coverage.ts` | ✅ Done | `coverageTask(sats, aggregator)`; default `minAxisAggregator`; stub `meanAxisAggregator` |
| **A0.4** | `objective.ts` | ✅ Done | Sum over `ObjectiveTerm[]`; move / exposure / risk penalties as pluggable terms |
| **A0.5** | `planner.ts` | ✅ Done | `Planner.replan()` interface; `defaultPlanner` + `stubPlanner`; conformance test |
| **A0.6** | `summarize.ts` | ✅ Done | `summarize(state, summarizer?)`; v1 = `templateSummarizer`; tick writes `summary_text` |
| **A0.7** | `commsModel.ts` | ✅ Done (stub) | Gate wired via `fleetUsage`; **A3 adds graph/route/per-link utilization** |
| **A0.8** | `operatingPoint.ts` | ✅ Done | `resolveOperatingPoint` on `EngineInput`; enum, numeric, JSON bearing handles |

**Clarifications captured in design:**

- **A0.3 ≠ confidence aggregation.** A0.3 plugs in custom rules for combining **sensor-axis satisfaction** into task coverage (`cov_t`). Mission **confidence** still uses `confidenceMission` (min freshness) — a parallel injectable seam can be added later if needed.
- **A0.4 uses the same extensibility pattern as A0.2.** Rewards and penalties are additive **terms**, not a monolithic formula. Movement cost today is `moveCountPenaltyTerm`; future terms (fuel, comms load, route distance, operating-point cost) register without changing the planner core.
- **A0.7 comms is a stub seam only.** `staticCommsModel` + scalar `fleetUsage` wires the gate today. **Relay/path topology is NOT modeled yet** — see A3 and *Watch-outs* below. Do not implement relay logic in the planner.

---

## Lessons learned & watch-outs

These came from the post-S10 gap analysis and Phase A0 implementation. **Read before A1+.**

| # | Watch-out | Consequence if ignored |
|---|-----------|------------------------|
| W1 | **S4 freeze gate was missed** | Skipping A1–A4 makes estimation, env, comms imports **rewrites** not body swaps |
| W2 | **Test behavior, not tautologies** | Golden fixtures, monotonicity, seam-swap tests — not `expect(1).toBe(1)` |
| W3 | **A0.3 ≠ confidence** | Aggregator is for sensor-axis **coverage**; confidence still min-freshness |
| W4 | **Use factor/term lists** | New env effects → `EnvFactor`; new costs → `ObjectiveTerm`; no core branches |
| W5 | **Comms is a graph, not a scalar** | Relay paths need `route()` + per-link utilization in A3 — don't hack `fleetUsage` |
| W6 | **Operating points opaque to planner** | Handles resolved only in `resolveOperatingPoint` (A0.8) |
| W7 | **UI ellipse still ad-hoc** | Unify with `covToEllipse` in A1 — don't add a third uncertainty representation |
| W8 | **Engine purity** | `CommsModel`, `EnvironmentContext` injected on `EngineInput` — never DB inside engine |
| W9 | **Gate before grade** | Hard cutoffs (comms, depth, range) prune before objective scoring (P5) |
| W10 | **One step at a time** | Green suite between steps; don't batch A1 sub-shapes without tests |

---

## The sharpened freeze rule

> **A contract may freeze only when its *shape* covers every planned expansion — including ones whose
> bodies are years away. Bodies expand freely; shapes must be complete at freeze. Anything that adds a
> field/type later is not a seam — it is a rewrite wearing a seam's clothes.**

### The three tiers

| Tier | Meaning | Deferral rule | Requirement before bodies grow |
|------|---------|---------------|--------------------------------|
| **T1 — Body swap** | Same signature, smarter implementation | Safe indefinitely once seam is proven | No-op / stub seam test passes |
| **T2 — New shape** | New type, table, or field downstream code depends on | **Rewrite if shape missing** | Install type + trivial body + tests |
| **T3 — New leaf** | New task kind or planner DOF above frozen rollup | Safe once guard test passes | Rollup-is-leaf-agnostic guard test |

### What “frozen” means now

The S4 mission/assignment schema stays additive-only (invariant #7). Phase A **extends** the model with
new tables/types (`tracks`, `environment_fields`, `comms_links`, …) and refactors engine seams — it
does not reshape `cov_t → cov_m → tier` or `MissionState` columns.

---

## Execution phases (order of work)

```
Phase A — Structural foundation (T2 shapes + T1 seam retrofits)   ← DO THIS FIRST
Phase B — Guard tests (T3 prerequisites)
Phase C — Tier 3 bodies (area patrol, directional sensors)
Phase D — Tier 1 bodies (threats, spoofing, LLM, imported-data factors, solver)
```

Do not start Phase C until Phase A + B are green. Imported environmental/comms data lands in Phase A
as **shapes + stub bodies**; real imported values become **Phase D bodies** behind those shapes.

---

# PHASE A — Structural foundation

Install all shapes with trivial bodies. Each step: tests first → minimum implementation → green suite → commit.

## A0 — Seam retrofits (cheap; unblocks everything else)

These are missing from S0–S10 but required before any Tier 1 claim is honest.

| ID | Work | Replaces / fixes | Done when |
|----|------|------------------|-----------|
| A0.1 | **`reconcile(existing, incoming) → Fact`** | `mergeReportIntoBelief` last-write-only | ✅ All ingest paths call `reconcile`; v1 = newer wins, confidence unchanged |
| A0.2 | **`envMult(factors, ctx) → number`** | hardcoded `envMultMotion` | ✅ Product over `EnvFactor[]`; stub third factor (=1) is no-op |
| A0.3 | **`coverageTask(sats, aggregator = min)`** | inline `min` in `coverageTask` | ✅ Injecting `meanAxisAggregator` changes output without touching rollup |
| A0.4 | **`computeObjective(ctx, terms?) → number`** | inline obj in `planner.ts` | ✅ Sum over `ObjectiveTerm[]`; `lambda_exp`/`lambda_risk` wired; exposure=risk=0 today |
| A0.5 | **`Planner` interface + conformance test** | bare `generateCandidates` function | ✅ `Planner.replan()`; `defaultPlanner` + `stubPlanner`; conformance in `planner.conformance.test.ts` |
| A0.6 | **`summarize(state) → string`** | `formatAlertSummary` | ✅ Single entry point; v1 = `templateSummarizer`; swappable `Summarizer` |
| A0.7 | **`checkFleetCommsGate(assignments, commsModel, ts, budget)`** | `assignments.length <= BIG` | ✅ Gate calls `commsModel.fleetUsage(...)`; v1 static model returns 0 |
| A0.8 | **`resolveOperatingPoint(handle, asset) → ResolvedOp`** | `resolveSpeed` only | ✅ Opaque handle → `{ speed_kn, bearing_deg?, raw_handle }`; on `EngineInput` |

### A0.4 — Objective term registry (implemented)

Same seam pattern as `envMult` — additive terms, not a frozen formula:

```typescript
type ObjectiveTerm = (ctx: ObjectiveContext) => number;

const DEFAULT_OBJECTIVE_TERMS: ObjectiveTerm[] = [
  coverageRewardTerm,      // + Σ W_m · cov_m
  moveCountPenaltyTerm,    // − λ_move · n_moves
  exposurePenaltyTerm,     // − λ_exp · exposure  (0 until D3)
  riskPenaltyTerm,         // − λ_risk · risk      (0 until D3)
  // future: fuelCostTerm, commsLoadTerm, operatingPointCostTerm, …
];

computeObjective(ctx, terms?) → sum of terms
```

**Tests locked:** golden fixture `0.77`; each move costs exactly `λ_move`; exposure/risk penalties scale by `λ_exp`/`λ_risk`; injected stub term is no-op; extra cost term changes score predictably.

### A0.2 — EnvMult factor registry (partial — full registry in Phase A step A4)

```typescript
type EnvFactor = (ctx: EnvMultContext) => number;

const DEFAULT_ENV_FACTORS: EnvFactor[] = [motionEnvFactor];
// Phase A step A4 adds stub salinityFactor, seaStateFactor, fogFactor
```

**Already done (skip):** per-fact `half_life_s` on `Fact` (T1.5 shape); numeric operating-point handles in `defaultResolveSpeed` (partial T1.6).

**Commit boundary:** `A0: seam retrofits`.

---

## A1 — Estimation & uncertainty shapes (T2.1–T2.4)

Makes Kalman fusion, triangulation, and unified UI rendering into Tier 1 swaps later.

### T2.1 — `Estimate = (mean, covariance)`

- `type Estimate = { mean: number[]; cov: number[][]; ts: number }` — v1 state `[x, y, vx, vy]`.
- v1 body: diagonal `σ²·I`, `vx = vy = 0`.
- `covToEllipse(cov, k=2) → UncertaintyRegion` on the 2×2 position block.
- **Rule:** store the full matrix always; never a scalar “confidence to promote later.”

**Tests:** ellipse geometry; serialize/deserialize preserves `cov`; positive-definite guard.

### T2.2 — `Measurement = { z, h, R, ts, observer_pose, observer_id, sensor }`

- v1 position producer: `h = state => [state[0], state[1]]`, `R = σ²·I`.
- Test-only bearing producer: `h = state => [atan2(…)]`, `R = [[σθ²]]`.
- **Rule:** `update()` uses `h` and `R` from the measurement — never hardcoded identity.

**Tests:** sensor-agnostic update path (no `if sensor === …`).

### T2.3 — `Estimator { predict, update }`

- v1 `FixedGainEstimator`; future `KalmanEstimator` (Tier 1 swap, same interface).
- **Rule:** pure; `dt`/`now` passed in; `MotionModel` injected.

**Tests:** predict grows trace(cov); update shrinks trace(cov) and pulls mean toward `z`; determinism;
seam-swap compiles at same call sites.

**Kalman-readiness (write as `test.todo` now):** two bearing-only measurements ~90° apart →
anisotropic covariance collapse. FixedGain will fail; documents the future contract.

### T2.4 — `Track` / `Observation` / `UncertaintyRegion`

- `Observation = Measurement & { track_id?: string }`.
- `Track = { id, estimate, last_updated, contributing[], classification? }`.
- Supabase `tracks` table (parallel to `belief_facts` — own assets stay on Facts for now).
- `UncertaintyRegion = { center, semiMajor, semiMinor, angleRad }` from `covToEllipse`.
- **Own-asset search ellipse uses the same type** — refactor UI `searchEllipseSemiMajor` to consume
  `UncertaintyRegion` derived from a degraded own-asset `Estimate` or reachable-set `MotionModel.predict`.

**Tests:** one detection → fat blob; second detection shrinks region; own-asset + track share one renderer.

**Migration note:** own-asset belief remains `belief_facts` (scalar Facts) in v1. External contacts use
`Track`. Promoting own assets to `Estimate` is a Phase D body swap once `reconcile` + ingest paths are stable.

**Commit boundary:** `A1: estimation shapes`.

---

## A2 — Motion & environment shapes (T2.5 + T2.6)

Supports imported **wind**, **sea currents**, and later **salinity / sea-state** lookups.

### T2.5 — `MotionModel.predict(state, dt, env?)`

```typescript
interface MotionModel {
  predict(state: number[], dt: number, env?: EnvironmentContext): { mean: number[]; Q: number[][] };
}
```

- v1 `ConstantVelocityModel`: `mean += v·dt`, `Q = q0·dt·I`.
- **Single injection point** for: dead reckoning, search-ellipse growth, `Fact.half_life` derivation (Phase D).
- Future body: add current drift `+ [u,v]·dt` from imported currents; wind drift for surface assets.

**Tests:** CV advances position exactly; trace(Q) grows with dt; search ellipse semi-major after Δt
matches `Q` (not ad-hoc `v_max·Δt` in UI).

### T2.6 — `EnvironmentContext` + imported field storage

Unified shape for all gridded / point environmental imports.

```typescript
type FieldKind = 'salinity_psu' | 'sea_state_hs_m' | 'wind_ms' | 'current_u_ms' | 'current_v_ms' | 'fog_vis_km';

interface EnvironmentSample {
  ts: number;
  x_km: number;
  y_km: number;
  depth_m?: number;
  kind: FieldKind;
  value: number;
}

interface EnvironmentContext {
  ts: number;
  sample(kind: FieldKind, x_km: number, y_km: number, depth_m?: number): number | null;
}
```

- Supabase `environment_samples` (or `environment_fields` with jsonb grid — pick one, store `(ts, kind, x, y, depth, value)` rows for v1).
- v1 body: `StaticEnvironmentContext` returns config defaults (no import yet).
- v1 ingest adapter: `loadEnvironmentContext(ts) → EnvironmentContext` passed into engine each tick.

**Import contract (document only until data arrives):**

| Import | `FieldKind` | Consumed by |
|--------|-------------|-------------|
| Salinity | `salinity_psu` | `envMult` factor (acoustic absorption) |
| Sea state (Hs) | `sea_state_hs_m` | `envMult` factor (surface sensors, motion) |
| Wind speed/direction | `wind_ms` (+ direction in sample metadata) | `MotionModel` (surface drift), optional `envMult` |
| Current u/v | `current_u_ms`, `current_v_ms` | `MotionModel.predict` drift term |
| Fog / visibility | `fog_vis_km` | `envMult` factor (EO/IR) |

**Tests:** `sample` returns default when no data; interpolated stub returns nearest-neighbor; context is
passed through `effectiveQuality` and `MotionModel.predict` without engine importing DB.

**Commit boundary:** `A2: motion and environment shapes`.

---

## A3 — Comms shapes (T2.7)

Supports imported **link budgets**, **latency**, **multi-hop relay paths**, and per-link contention.

> **A0.7 done:** `CommsModel` interface + `staticCommsModel` stub + gate wired via `fleetUsage`.
> **A3 extends the shape** for relay topology — do not treat scalar `fleetUsage` as the final model.

### T2.7 — `CommsModel` + graph storage

Comms is a **graph**: nodes (assets, relays, shore, sat terminals) and directed links (hops).
Contention is **per-link**, not a single fleet scalar.

```typescript
interface CommsNode {
  id: string;
  kind: "asset" | "relay" | "shore" | "sat_terminal";
}

interface CommsLink {
  from_id: string;
  to_id: string;
  bandwidth_bps: number;
  delay_s: number;
  ts: number;
}

interface CommsModel {
  // A0.7 — keep
  linkBudget(from: string, to: string, ts: number): CommsLink | null;

  // A3 — add for relays
  route(from: string, to: string, ts: number): string[];  // node ids, endpoints included
  pathDelay(sentTs: number, from: string, to: string): number;  // sum hop delays on route
  linkUtilization(assignments: Assignment[], ts: number): Map<string, number>;  // key "from:to"

  // A0.7 stub — deprecate for gate once linkUtilization lands; keep for simple demos
  fleetUsage(assignments: Assignment[], ts: number): number;
  messageDeliveryTs(sentTs: number, from: string, to: string): number;
}
```

**Storage (Supabase):**

- `comms_links` — edges `(from_id, to_id, bandwidth_bps, delay_s, ts)`
- `comms_nodes` (optional) — node metadata, relay type, role

**Gate (evolve from A0.7):**

```typescript
// v1 (A0.7, today): fleetUsage <= comms_budget
// target (A3):  max(linkUtilization.values()) <= 1  OR  each link <= budget
```

**Consumers:**

- **`checkFleetCommsGate`** — per-link or max utilization (planner/applyPlan unchanged at call site)
- **`ingestReports`** — `pathDelay(sentTs, asset, "operator")` for multi-hop delivery
- **Monitor** — latency-aware staleness on degraded links

**Tests:**

- Two-hop route: delay = sum of hop delays
- Two assets sharing one relay link: utilization on that link rises; gate rejects when over budget
- `fleetUsage` stub still passes when utilization map is empty (backward compat)

**Anti-pattern:** encoding relay paths in planner moves or summing all traffic into one `fleetUsage`
number without per-link keys.

**Commit boundary:** `A3: comms graph shapes`.

---

## A4 — EnvMult factor registry (connects T2.6 → coverage)

Refactor `effectiveQuality` to use the extensible product from A0.2:

```typescript
type EnvFactor = (ctx: EnvironmentContext, sensor: SensorSpec, vehicle: VehicleState) => number;

const ENV_FACTORS: EnvFactor[] = [
  motionFactor,           // e^(-k·speed/vmax) — today
  salinityFactor,         // stub → 1.0 until import
  seaStateFactor,         // stub → 1.0
  fogFactor,              // stub → 1.0
  // beamGainFactor added in Phase C (T3.2)
];
```

- Each factor is a separate file; registering a new factor requires zero engine core changes.
- **Rule:** hard cutoffs stay in gates (P5); factors are graded multipliers only.

**Tests:** register stub factor = 1.0 → no output change; register stub = 0.5 → quality scales.

**Commit boundary:** `A4: envMult factor registry`.

---

## Phase A checklist

- [x] A0.1 `reconcile` green
- [x] A0.2 extensible `envMult` green
- [x] A0.3 injectable `coverageTask` aggregator green
- [x] A0.4 extensible `computeObjective` / term registry green
- [x] A0.5 `Planner` interface + conformance test green
- [x] A0.6 `summarize` entry point green
- [x] A0.7 `CommsModel` + fleet gate green
- [x] A0.8 `resolveOperatingPoint` green
- [ ] T2.1–T2.4 estimation shapes + `tracks` migration + UI ellipse refactor
- [ ] T2.5 MotionModel + T2.6 EnvironmentContext + DB table
- [ ] T2.7 Comms **graph** shape (`route`, `linkUtilization`) + DB tables — **stub done in A0.7**
- [ ] A4 envMult factor registry with motion + stub salinity/sea-state/fog factors
- [ ] Kalman-readiness `test.todo` written
- [ ] `pnpm verify` green; engine purity lint still passes

---

# PHASE B — Guard tests (Tier 3 prerequisites)

Prove the rollup and planner DOFs are leaf-agnostic **before** building Tier 3 bodies.

## B1 — Rollup-is-leaf-agnostic (T3.1 guard)

Refactor `computeMissionCoverage` to dispatch:

```typescript
computeTaskLeaf(task, …) → { cov_t, confidence, freshnessValues }
```

- Point tasks → existing point leaf (today's logic).
- Unknown kinds → throw or return INFEASIBLE.

**Guard test:** mix point tasks + stub area leaf returning constant `cov_t = 0.7`; assert `coverageMission`
/ `tier` correct; assert rollup code never reads `task.target_x`, `task.kind`, or point-only fields.

## B2 — EnvMult extensibility guard (T3.2 partial)

Covered by A0.2 / A4 — retain as explicit gate: third stub factor is no-op.

## B3 — Opaque operating-point guard (T3.2 partial)

Covered by A0.8 — enum handle `{bearing: 45}` and `"SLOW"` through same `resolveOperatingPoint`; planner
never branches on handle contents.

**Commit boundary:** `B: tier-3 guard tests`.

---

# PHASE C — Tier 3 bodies (new leaves above rollup)

Only after Phase A + B are green.

## C1 — Area / patrol coverage (T3.1 body)

- Add `task.kind: 'POINT' | 'AREA'` (default `POINT`).
- AREA params: `{ geometry, required_quality, revisit_interval_s }`.
- `coverageArea(…) → { cov_t, confidence }` — covered-cell fraction, quality-weighted, temporal revisit decay.
- Planner: sweep-path / waypoint-sequence candidates (new move kind or operating-point extension).

**Tests:** coverage rises with cells covered; unrevisited cells decay; one vehicle cannot blanket a long
line instantly; rollup unchanged.

## C2 — Directional sensors + pointing (T3.2 body)

- `beamGain(θ)` factor registered in `ENV_FACTORS`.
- Pointing as operating-point dimension (`resolveOperatingPoint` returns `{ speed_kn, bearing_deg }`).
- Contention: one sensor, one bearing at a time (fleet gate or capacity gate extension).

**Tests:** target outside beam → q ≈ 0; two tasks at different bearings conflict on one sensor.

**Commit boundary:** one commit per Tier 3 body.

---

# PHASE D — Tier 1 bodies (smart implementations behind frozen shapes)

Bodies can ship in any order once Phase A + B are complete. Mapped to original README stretch steps.

## D1 — Imported environmental data bodies (was “post-hackathon”)

| Factor | Body | Data source |
|--------|------|-------------|
| `salinityFactor` | acoustic absorption vs PSU | `environment_samples` import |
| `seaStateFactor` | surface sensor degradation vs Hs | import |
| `fogFactor` | EO/IR cutoff vs visibility | import |
| `MotionModel` current drift | `+ [u,v]·dt` from `current_u_ms` / `current_v_ms` | import |
| Wind drift (surface) | lateral drift term in `MotionModel` | `wind_ms` + direction import |

**Rule:** import pipeline writes `environment_samples` rows; engine reads via `EnvironmentContext` only.

## D2 — Imported comms data bodies (T1.8)

- Replace `staticCommsModel` with import-driven **graph** body (`comms_links`, optional `comms_nodes`).
- Routing: `route(asset, operator)` follows relay chain from import topology.
- `ingestReports` applies `pathDelay` so multi-hop delayed packets arrive with correct `ts`.
- Gate binds on **per-link utilization** (or max utilization), not scalar `fleetUsage` alone.

## D3 — Threats & risk (README S11, T1.1 body)

- `threats` / `no_go` tables.
- `RoutePlanner` computes `exposure` / `risk`; `computeObjective` already wired in A0.4.

## D4 — Spoofing / adversarial data (README S12, T1.2 body)

- `reconcile` lowers confidence when sources disagree; optional `SensorModel` for report validation.

## D5 — Real LLM narration (README S13, T1.3 body)

- Swap `summarize` body for LLM call; writes `summary_text` only (P8).

## D6 — Other Tier 1 bodies (as needed)

| ID | Body | Seam (installed in Phase A) |
|----|------|----------------------------|
| T1.5 | `half_life` from `MotionModel` | per-fact field ✓ |
| T1.6 | Continuous operating-point search | `resolveOperatingPoint` |
| T1.7 | Soft/weighted sensor aggregation | injected aggregator |
| T1.9 | λ normalization to coverage-equivalent units | `computeObjective` + config |
| T1.10 | MIP / column-generation solver | `Planner` interface |

---

# Data import integration summary

All external data enters through **two ingestion surfaces** — never directly into engine formulas.

```
┌─────────────────────┐     ┌──────────────────────┐
│ environment_samples │────▶│ EnvironmentContext   │──▶ MotionModel.predict
│ (salinity, Hs,      │     │ .sample(kind,x,y,d)  │──▶ envMult factors
│  wind, currents,    │     └──────────────────────┘
│  fog)               │
└─────────────────────┘

┌─────────────────────┐     ┌──────────────────────────────┐
│ comms_links         │────▶│ CommsModel                   │
│ comms_nodes (opt)   │     │ .route / .pathDelay          │──▶ ingest delivery_ts
└─────────────────────┘     │ .linkUtilization (per hop)   │──▶ fleet gate
                            │ .linkBudget                  │──▶ Monitor staleness
                            └──────────────────────────────┘

┌─────────────────────┐     ┌──────────────────────┐
│ reports             │────▶│ reconcile()          │──▶ belief_facts
└─────────────────────┘     └──────────────────────┘

┌─────────────────────┐     ┌──────────────────────┐
│ detections          │────▶│ Estimator.update     │──▶ tracks
└─────────────────────┘     └──────────────────────┘
```

**Engine purity preserved:** `packages/engine` receives plain `EnvironmentContext`, `CommsModel`, and
`Belief` objects — no DB imports, no `world_truth`, no `Date.now()` (P2).

---

# Tier reference (complete)

## Tier 2 — Shapes (Phase A)

| ID | Shape | Phase | Status |
|----|-------|-------|--------|
| T2.1 | `Estimate`, `covToEllipse` | A1 | Not started |
| T2.2 | `Measurement` | A1 | Not started |
| T2.3 | `Estimator` | A1 | Not started |
| T2.4 | `Track`, `Observation`, `UncertaintyRegion` | A1 | Not started |
| T2.5 | `MotionModel` | A2 | Not started |
| T2.6 | `EnvironmentContext`, `environment_samples` | A2 | Not started |
| T2.7 | `CommsModel` graph, `comms_links`, `comms_nodes` | A3 | Stub (A0.7) — graph pending |

## Tier 3 — Leaves (Phase C; guards in Phase B)

| ID | Leaf | Guard | Body |
|----|------|-------|------|
| T3.1 | Area / patrol coverage | B1 rollup-is-leaf-agnostic | C1 |
| T3.2 | Directional sensors + pointing | B2 envMult + B3 opaque handle | C2 |

## Tier 1 — Bodies (Phase D)

| ID | Expansion | Seam installed | Body phase |
|----|-----------|----------------|------------|
| T1.1 | Threat routing; exposure/risk | A0.4 ✅ | D3 (S11) |
| T1.2 | Spoofing | A0.1 ✅ | D4 (S12) |
| T1.3 | LLM summaries | A0.6 ✅ | D5 (S13) |
| T1.4 | Salinity / sea-state / fog | A0.2 ✅ (+ A4 registry pending) | D1 |
| T1.5 | Dynamics-aware staleness | half_life field ✅ | D6 |
| T1.6 | Continuous operating points | A0.8 ✅ | D6 |
| T1.7 | Substitutable sensors | A0.3 ✅ | D6 |
| T1.8 | Fleet comms contention | A0.7 ✅ + T2.7 | D2 |
| T1.9 | Objective normalization | A0.4 ✅ | D6 |
| T1.10 | MIP / column-generation | A0.5 ✅ | D6 |
| — | Wind / current motion | T2.5 + T2.6 | D1 |
| — | Comms delay in ingest | T2.7 | D2 |
| — | Kalman fusion | T2.3 | post-D (Tier 1 swap) |

---

# Agent workflow (unchanged from README)

For every step in Phase A–D:

1. Read the step goal and tests. Stop and ask if ambiguous.
2. Write tests first; confirm they fail for the right reason.
3. Implement the minimum for that step only.
4. Run full suite; do not proceed while red.
5. Commit with phase/step id (e.g. `A0: seam retrofits`, `A1: estimation shapes`).
6. Stop, summarize, show green output, wait for confirmation.

**Anti-patterns:** reshaping frozen rollup; importing DB inside engine; scalar uncertainty for tracks;
multiplying confidence into coverage; skipping guard tests before Tier 3 bodies; **relay comms logic
in planner or scalar-only `fleetUsage` without per-link utilization (W5)**.

---

# README alignment

| README step | This register |
|-------------|---------------|
| S11 Threats & risk | D3 (requires A0.4) |
| S12 Scale + spoofing | D4 (requires A0.1) + scale testing after shapes stable |
| S13 LLM narration | D5 (requires A0.6) |
| Deferred: salinity / sea-state / fog | T2.6 + A4 shapes → D1 bodies |
| Deferred: dynamics-aware staleness | T2.5 → D6 body |
| Deferred: area coverage | B1 guard → C1 body |
| Deferred: comms contention | T2.7 graph + A0.7 gate → D2 body |
| Deferred: MIP solver | A0.5 → D6 body |

---

# Next action

**Phase A1 next** — estimation shapes (`Estimate`, `Measurement`, `Estimator`, `Track`, unified uncertainty). Then A2 → A3 → A4 → Phase B.
