# Expansion Register — Mission Orchestrator

**Status:** S0–S10 · **A0–A4** · **B** · **C (C1a–C1b + C2)** · **UI-1** · **D1** · **D2** · **D3** complete · **D4 next**

> **New agent pickup:** [HANDOVER.md](HANDOVER.md) § *Agent pickup* · canonical plan below · demo: [SCENARIO_OFFSHORE.md](SCENARIO_OFFSHORE.md) · design mock: [`example_operator_console_design.html`](example_operator_console_design.html).
> Health: `pnpm db:verify` (**17/17** tables) · `pnpm verify` (~**213** tests · 1 Kalman `test.todo`).

This replaces the flat Deferred register in [BUILD.md](BUILD.md). Every expansion is classified by
**what it requires of the architecture**, because the deferral rule is different for each tier.

---

## Current state (honest)

The original freeze gate (before S4) was not run. S4–S10 shipped on a scalar-`Fact` belief model,
hardcoded `envMult`, last-write-by-ts ingest, and a minimal UI scaffold. Phase **UI-1** (June 2026)
replaced that scaffold with the full **operator console** from [`example_operator_console_design.html`](example_operator_console_design.html)
— dual tactical view, fleet rail, decision column, scenario timeline. Several future features remain
**rewrites** if their shapes are missing; the console itself is the live demo surface for Phase D bodies.

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
| **A0.4** | `objective.ts` | ✅ Done | Sum over `ObjectiveTerm[]`; move / exposure / risk penalties as pluggable terms — **D3 bodies live** |
| **A0.5** | `planner.ts` | ✅ Done | `Planner.replan()` interface; `defaultPlanner` + `stubPlanner`; conformance test |
| **A0.6** | `summarize.ts` | ✅ Done | `summarize(state, summarizer?)`; v1 = `templateSummarizer`; tick writes `summary_text` |
| **A0.7** | `commsModel.ts` | ✅ Done | Graph model + per-link gate; `staticCommsModel` fallback when no links |
| **A0.8** | `operatingPoint.ts` | ✅ Done | `resolveOperatingPoint` on `EngineInput`; enum, numeric, JSON bearing handles |

**Clarifications captured in design:**

- **A0.3 ≠ confidence aggregation.** A0.3 plugs in custom rules for combining **sensor-axis satisfaction** into task coverage (`cov_t`). Mission **confidence** still uses `confidenceMission` (min freshness) — a parallel injectable seam can be added later if needed.
- **A0.4 uses the same extensibility pattern as A0.2.** Rewards and penalties are additive **terms**, not a monolithic formula. Movement cost today is `moveCountPenaltyTerm`; future terms (fuel, comms load, route distance, operating-point cost) register without changing the planner core.
- **A0.7 comms graph complete (A3).** `buildCommsModel` + `route()` / `pathDelay()` / `linkUtilization()`; gate uses max utilization ≤ 1 when graph loaded, else `fleetUsage`. **`messageDeliveryTs(sentTs, from, to, queryTs?)`** — pass `input.now` as `queryTs` for link snapshot (not `sentTs`).

### Progress log (Phase A2 — motion + environment)

| Step | Module / table | Status | Notes |
|------|----------------|--------|-------|
| **A2 / T2.5** | `motionModel.ts` | ✅ Done | `ConstantVelocityModel`, `propagateState`; search region uses propagated Q |
| **A2 / T2.6** | `environmentContext.ts` | ✅ Done | `staticEnvironmentContext`, `sampleEnvironmentContext`, `buildEnvironmentContext` |
| **A2 / T2.6** | `environment_samples` | ✅ Done | Migration `a2_environment_samples` on remote via Supabase MCP |
| **A2 wire** | `EngineInput` | ✅ Done | + `motionModel`, `environmentContext`; `loadEnvironmentContext` in db adapter |
| **A2 wire** | `effectiveQuality` | ✅ Done | Passes `environmentContext` into `envMult` ctx; D1 factor bodies registered |

**Commit boundary:** `A2: motion and environment shapes`.

### Progress log (Phase A3 — comms graph)

| Step | Module / table | Status | Notes |
|------|----------------|--------|-------|
| **A3 / T2.7** | `commsModel.ts` | ✅ Done | `buildCommsModel`, `route`, `pathDelay`, `linkUtilization`; BFS routing |
| **A3 / T2.7** | `comms_links`, `comms_nodes` | ✅ Done | Migration `a3_comms_graph` via Supabase MCP; 14/14 tables |
| **A3 wire** | `packages/db/comms.ts` | ✅ Done | `loadCommsLinks`, `loadCommsModel` → `buildEngineInputFromDb` |
| **A3 gate** | `checkFleetCommsGate` | ✅ Done | Per-link utilization when map non-empty; `fleetUsage` fallback |
| **A3 tests** | unit + integration | ✅ Done | `commsModel.test.ts` (12); `comms.integration.test.ts` (live Supabase) |

**Commit boundary:** `A3: comms graph shapes`.

### Progress log (Phase A4 — envMult factor registry)

| Step | Module | Status | Notes |
|------|--------|--------|-------|
| **A4** | `envFactors/salinityFactor.ts` | ✅ Done | D1 body — PSU curve; `passive_acoustic` only |
| **A4** | `envFactors/seaStateFactor.ts` | ✅ Done | D1 body — Hs degradation; surface sensors |
| **A4** | `envFactors/fogFactor.ts` | ✅ Done | D1 body — visibility; `eo_ir` only |
| **A4** | `DEFAULT_ENV_FACTORS` | ✅ Done | `[motion, salinity, seaState, fog, beamGain]` — D1 bodies live; beamGain no-op when omnidirectional |

**Commit boundary:** `A4: envMult factor registry` · **C2** added `beamGainFactor`.

### Progress log (Phase C — Tier 3 bodies)

| Step | Module / table | Status | Notes |
|------|----------------|--------|-------|
| **C1a / T3.1** | `volume/footprint.ts`, `coverageVolume.ts` | ✅ Done | AABB discretizer; per-cell `effectiveQuality`; linear revisit decay; `task_volume_visits` |
| **C1a wire** | `stateEngine.ts`, `packages/db/volume.ts` | ✅ Done | `computeAreaTaskLeaf` → `coverageVolume`; tick persists visits |
| **C1a DDL** | `c1_volume_patrol` | ✅ Done | `tasks.kind`, `footprint jsonb`, z band; **15/15** tables |
| **C1b** | `volume/patrolSweep.ts` | ✅ Done | Opaque `patrol:cell_id` handles; `planningOverrides` sandbox-only; max 3 cell candidates |
| **C1b wire** | `planner.ts`, `vehicleState.ts` | ✅ Done | Patrol plans beat do-nothing when vehicle outside volume; B3 lint green |
| **C2 / T3.2** | `sensors/beamGeometry.ts`, `beamGainFactor.ts` | ✅ Done | 3D cone; `EnvMultContext.target`; omnidirectional when `beam_half_angle_deg` omitted |
| **C2 wire** | `pointingGate.ts`, `operatingPoint.ts` | ✅ Done | `elevation_deg` on resolver; `checkPointingGate` on plan eval + commit |
| **C2 DDL** | `c2_directional_sensors` | ✅ Done | `asset_sensors.beam_half_angle_deg` nullable |

**Commit boundaries:** `C1: volume patrol (AABB)` · `C1b: patrol sweep` · `C2: directional sensors`.

### Progress log (UI-1 — operator console frontend) ✅

| Item | Status | Notes |
|------|--------|-------|
| **Design port** | ✅ Done | [`example_operator_console_design.html`](example_operator_console_design.html) → `apps/ui/src/styles.css` |
| **Shell + layout** | ✅ Done | `App.tsx` — header / fleet / stage / decision / timeline grid |
| **Plan view** | ✅ Done | `PlanView.tsx` — top-down chart, volume cells, search ellipses, domain chevrons |
| **Profile view** | ✅ Done | `ProfileView.tsx` — water-column elevation (signature dual view) |
| **Realtime** | ✅ Done | Supabase subscriptions: `belief_facts`, `mission_state`, `plan_eval`, `alert_log`, `task_volume_visits` |
| **Scenario API** | ✅ Done | `orchestrator-api-plugin.ts` + `api-handlers.ts` — tick scrubber, reset, apply-plan |
| **Offshore demo** | ✅ Done | [SCENARIO_OFFSHORE.md](SCENARIO_OFFSHORE.md) — ticks 0–8, UUV comms loss at tick 4 |
| **Asset drawer** | ✅ Done | Sensor base vs effective via engine `effectiveQuality`; op point readout |
| **Contacts rail** | stub | Empty state until `tracks` populated in scenario |
| **Env samples (D1)** | ✅ Done | Realtime on `environment_samples`; drawer + search ellipses use env context |

**Commit boundary:** `UI-1: operator console frontend`.

### Progress log (Phase D1 — imported environmental data) ✅

| Step | Module | Status | Notes |
|------|--------|--------|-------|
| **D1-import** | `packages/env-import/` | ✅ Done | Open-Meteo Marine + Weather; Copernicus salinity via Python bridge |
| **D1-import CLI** | `env-fetch` | ✅ Done | `orchestrator env-fetch [tick] \| --all-ticks` · `--skip-copernicus` |
| **D1-import wire** | `scenario-run.ts` | ✅ Done | `replayToTick` auto-runs env-fetch after reset |
| **D1 geo** | `offshore-pipeline.ts` | ✅ Done | 56.5°N, 1.0°E anchor · 5×5 km grid · depths 0 + 60 m |
| **D1 factors** | `envFactors/curves.ts`, `salinity`, `seaState`, `fog` | ✅ Done | Sensor-specific graded multipliers; no-op without env |
| **D1.2 motion** | `motionModel.ts` | ✅ Done | `environmentDriftMs` — currents + surface/air windage |
| **D1 FieldKind** | `wind_direction_deg` | ✅ Done | Additive field on `EnvironmentContext` |
| **D1 validation** | `validateSamples.ts` | ✅ Done | Range checks; `RUN_LIVE_ENV_TESTS=1` integration tests |
| **D1 DB** | `upsertEnvironmentSamples` | ✅ Done | `packages/db/environment.ts` |
| **D1 UI** | `App.tsx`, `PlanView.tsx`, `lib.ts` | ✅ Done | Env-degraded effective quality; drift-aware search ellipses |

**APIs:** Open-Meteo (free) · Copernicus Marine (`COPERNICUSMARINE_*`) · Sentinel Hub optional (not wired).

**Commit boundary:** `D1: imported environmental data`.

### Progress log (Phase D2 — comms pathDelay in ingest) ✅

| Step | Module | Status | Notes |
|------|--------|--------|-------|
| **D2 ingest** | `ingest.ts` | ✅ Done | `IngestOptions` — `commsModel`, `now`, `queryTs`; delivery ts on facts |
| **D2 wire** | `tick.ts`, `cli.ts` | ✅ Done | Rebuild belief from `loadReportsUpTo` + DB `loadCommsModel` |
| **D2 topology** | `offshore-pipeline.ts`, `seed.sql` | ✅ Done | Relay buoy, acoustic gateway, sat terminal |
| **D2 DB** | `belief.ts` | ✅ Done | `loadReportsUpTo(maxSentTs)` |

**Commit boundary:** `D2: comms pathDelay in ingest`.

### Progress log (Phase D3 — threats & exposure / risk) ✅

| Step | Module | Status | Notes |
|------|--------|--------|-------|
| **D3 engine** | `routePlanner.ts` | ✅ Done | `ThreatZone`, `NoGoZone`, `buildRoutePlanner`, `checkNoGoGate` |
| **D3 measure** | `RoutePlanner.measure()` | ✅ Done | exposure = max proximity; risk = max intensity × proximity along belief→task segments |
| **D3 planner** | `planner.ts` | ✅ Done | Live exposure/risk in `computeObjective`; `plan_eval.total_exposure` populated |
| **D3 commit** | `applyPlan.ts` | ✅ Done | No-go gate at commit time |
| **D3 DDL** | `d3_threats` | ✅ Done | `threats`, `no_go_zones` — **17/17** tables |
| **D3 DB** | `packages/db/threats.ts` | ✅ Done | `loadRoutePlanner` → `buildEngineInputFromDb` |
| **D3 seed** | `seed.sql`, `offshore-pipeline.ts` | ✅ Done | Hostile surface threat + fisher exclusion no-go |
| **D3 tests** | `routePlanner.test.ts` | ✅ Done | Geometry, monotonicity, no-go gate, planner pruning |

**Commit boundary:** `D3: threats and route exposure/risk`.

### Progress log (Phase B — guard tests)

| Step | Module / test | Status | Notes |
|------|---------------|--------|-------|
| **B1** | `computeTaskLeaf` dispatch | ✅ Done | POINT leaf + AREA stub (0.7); unknown kind → infeasible |
| **B1** | `guard.test.ts` | ✅ Done | Mixed mission rollup; POINT golden fixture (~0.8473) |
| **B1** | `lint-rollup-purity.mjs` | ✅ Done | Static guard — `computeMissionCoverage` must not read point-only fields |
| **B2** | `guard.test.ts` + A4 tests | ✅ Done | Salinity stub no-op on `DEFAULT_ENV_FACTORS` |
| **B3** | `guard.test.ts` + `lint-planner-purity.mjs` | ✅ Done | JSON bearing + enum handles; planner must not parse `operating_point` |

**Commit boundary:** `B: tier-3 guard tests`.

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
| W7 | **UI ellipse unified with engine** | Done in A1/A2 + **UI-1** — `PlanView` uses `ownAssetSearchUncertainty`; profile view uses signed z |
| W8 | **Engine purity** | `CommsModel`, `EnvironmentContext` injected on `EngineInput` — never DB inside engine |
| W9 | **Gate before grade** | Hard cutoffs (comms, depth, range) prune before objective scoring (P5) |
| W10 | **One step at a time** | Green suite between steps; don't batch A1 sub-shapes without tests |
| W11 | **3D spatial seam** | All engine math uses `Position3` + z-up; **only `spatial.ts`** converts legacy `depth_m` (`z_m = -depth_m`) |
| W12 | **Horizontal bearing ≠ 3D** | `horizontalBearingMeasurement` is azimuth only; full triangulation needs elevation (C2/D6) |
| W13 | **Slant range seam** | Use `rangeM()` / `rangeKm()` in coverage — not raw `hypot(dx, dy)` |
| W14 | **Volume patrol (C1)** | AREA tasks patrol a **3D AABB** (`Footprint` seam); polygon = later body swap on `discretizeFootprint` — see [C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md) |
| W15 | **`planningOverrides` is sandbox-only** | Live tick uses belief position only; patrol handles affect coverage only when planner sets hypothetical cell positions |
| W16 | **Patrol handle prefix is `patrol:`** (lowercase) | Parsed in `parsePatrolHandle` / `resolveOperatingPoint` — planner passes opaque string, never cell geometry |
| W17 | **Directional = optional column** | Omit `beam_half_angle_deg` → omnidirectional; existing passive_acoustic demo unchanged |
| W18 | **Scan time / dwell deferred** | Extend `VolumeVisitRecord` (+ `dwell_s`) and/or `ObjectiveTerm[]` — do not rewrite rollup or `discretizeFootprint` |

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
Phase A — Structural foundation (T2 shapes + T1 seam retrofits)   ✅ COMPLETE
Phase B — Guard tests (T3 prerequisites)                          ✅ COMPLETE
Phase C — Tier 3 bodies (volume patrol, patrol sweep, directional sensors)  ✅ COMPLETE
UI-1    — Operator console frontend (design mock → live React app)  ✅ COMPLETE
Phase D1 — Imported env data (import + envMult + motion drift)  ✅ COMPLETE
Phase D2 — Comms pathDelay in ingest (graph + delivery hold)     ✅ COMPLETE
Phase D3 — Threats / exposure / risk (RoutePlanner body)         ✅ COMPLETE
Phase D — Remaining Tier 1 bodies (D4–D6)                      ← NEXT
```

Do not start Phase C until Phase A + B are green. Imported environmental/comms data lands in Phase A
as **shapes + stub bodies**; real imported values become **Phase D bodies** behind those shapes.

---

## 3D spatial model (locked — June 2026)

All Phase A+ engine work uses one vertical axis and SI internals. Full pickup spec: [A1_REVISE_3D.md](A1_REVISE_3D.md).

| Topic | Rule |
|-------|------|
| **Engine position** | `Position3 { x_m, y_m, z_m }` — meters only inside `packages/engine` |
| **Vertical axis** | **z-up**, sea surface = 0; altitude **> 0**, depth **< 0** (deeper = more negative) |
| **Legacy DB** | Columns stay `x_km`, `depth_m`, `target_depth_m`; adapter: **`z_m = -depth_m`** in `spatial.ts` only |
| **Air assets** | **`z_m` belief fact** (positive); do not infer altitude from `depth_m = 0` alone |
| **Estimation state** | layout **`cv6`**: `[x_m, y_m, z_m, vx, vy, vz]` + 6×6 cov |
| **Coverage range** | **3D slant range** via `rangeM()` seam (display as km for sensor `max_range_km`) |
| **Gates (P5)** | z bounds: rating `z_m ≥ -rating`; min depth `z_m ≤ -min_depth_m`; max altitude `0 ≤ z_m ≤ max` |
| **Display** | `altitude_m = max(z,0)`, `depth_display_m = max(-z,0)` (UI, LLM D5) |

**A1 initial** shipped 2D cv4 estimation (horizontal ellipse, 4×4 cov). **A1-revise complete** — 3D cv6, slant range, z-up adapter per [A1_REVISE_3D.md](A1_REVISE_3D.md).

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
| A0.4 | **`computeObjective(ctx, terms?) → number`** | inline obj in `planner.ts` | ✅ Sum over `ObjectiveTerm[]`; exposure/risk live via `routePlanner` (D3) |
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
  exposurePenaltyTerm,     // − λ_exp · exposure  (D3 ✅)
  riskPenaltyTerm,         // − λ_risk · risk      (D3 ✅)
  // future: fuelCostTerm, commsLoadTerm, operatingPointCostTerm, …
];

computeObjective(ctx, terms?) → sum of terms
```

**Tests locked:** golden fixture `0.77`; each move costs exactly `λ_move`; exposure/risk penalties scale by `λ_exp`/`λ_risk`; injected stub term is no-op; extra cost term changes score predictably.

### A0.2 — EnvMult factor registry (complete in A4)

```typescript
type EnvFactor = (ctx: EnvMultContext) => number;

const DEFAULT_ENV_FACTORS: EnvFactor[] = [
  motionEnvFactor,
  salinityFactor,    // D1 ✅ — PSU curve
  seaStateFactor,    // D1 ✅ — Hs degradation
  fogFactor,         // D1 ✅ — visibility
];
```

**Already done (skip):** per-fact `half_life_s` on `Fact` (T1.5 shape); numeric operating-point handles in `defaultResolveSpeed` (partial T1.6).

**Commit boundary:** `A0: seam retrofits`.

---

## A1 — Estimation & uncertainty shapes (T2.1–T2.4)

Makes Kalman fusion, triangulation, and unified UI rendering into Tier 1 swaps later.

**Status:** Initial A1 **done** · **A1-revise done** — 3D cv6 + slant range per [A1_REVISE_3D.md](A1_REVISE_3D.md).

### T2.1 — `Estimate = (mean, covariance)`

- `type Estimate = { layout: 'cv6'; mean: number[]; cov: number[][]; ts: number }` — state **`[x_m, y_m, z_m, vx, vy, vz]`** (SI).
- v1 body: diagonal position σ², zero velocity; **`migrateEstimate()`** upgrades legacy 4D JSON.
- `covToEllipse(cov, k=2) → UncertaintyRegion` on **horizontal x–y block** (map projection).
- `zUncertainty(mean, cov) → { z_m, sigma_m }` from Z component.
- **Rule:** store the full 6×6 matrix always; never a scalar “confidence to promote later.”

**Tests:** ellipse geometry; serialize/deserialize; positive-definite guard; 4D→6D migration with large z variance (not z=0).

### T2.2 — `Measurement = { z, h, R, ts, observer_pose, observer_id, sensor }`

- v1 **`position3Measurement`**: `h(state) => [x, y, z]`, diagonal R in meters.
- **`horizontalBearingMeasurement`**: azimuth in horizontal plane only — **not** full 3D LOS (elevation deferred).
- **Rule:** `update()` uses `h` and `R` from the measurement — never hardcoded identity.

**Tests:** sensor-agnostic update path (no `if sensor === …`); 3D fix pulls z.

### T2.3 — `Estimator { predict, update }`

- v1 `FixedGainEstimator`; future `KalmanEstimator` (Tier 1 swap, same interface).
- **Rule:** pure; `dt`/`now` passed in; **6D SI state**; `MotionModel` injected in A2.
- **`spatial.ts`**: `StateLayout` indices — no raw `state[n]` elsewhere.

**Tests:** predict grows trace(cov); update shrinks trace(cov) and pulls mean toward z; determinism;
seam-swap compiles at same call sites.

**Kalman-readiness (`test.todo`):** two bearing-only measurements ~90° apart → anisotropic covariance;
**plus** future 3D bearing + elevation for true triangulation.

### T2.4 — `Track` / `Observation` / `UncertaintyRegion`

- `Observation = Measurement & { track_id?: string }`.
- `Track = { id, estimate, last_updated, contributing[], classification? }`.
- Supabase `tracks` table (parallel to `belief_facts` — own assets stay on Facts for now).
- `UncertaintyRegion = { center, semiMajor, semiMinor, angleRad }` from `covToEllipse`.
- **Own-asset search ellipse uses the same type** — **UI-1 done:** `PlanView.tsx` consumes `ownAssetSearchUncertainty` → `UncertaintyRegion` (not ad-hoc `v_max·Δt`).

**Tests:** one detection → fat blob; second detection shrinks region; own-asset + track share one renderer.

**Migration note:** own-asset belief remains `belief_facts` (scalar Facts) in v1. External contacts use
`Track`. Promoting own assets to `Estimate` is a Phase D body swap once `reconcile` + ingest paths are stable.

**Commit boundary:** `A1: estimation shapes` (initial, done) · **`A1-revise: 3D spatial model`** (cv6 + slant range).

---

## A2 — Motion & environment shapes (T2.5 + T2.6) ✅ COMPLETE

Supports imported **wind**, **sea currents**, and later **salinity / sea-state** lookups.

**Shipped:** `packages/engine/src/motionModel.ts`, `environmentContext.ts`; `packages/db/src/environment.ts`;
`EngineInput.motionModel` + `EngineInput.environmentContext`; remote table `environment_samples` (12/12 tables).

### T2.5 — `MotionModel.predict(state, dt, env?)`

```typescript
interface MotionModel {
  predict(state: number[], dt: number, env?: EnvironmentContext): { mean: number[]; Q: number[][] };
}
```

- v1 `ConstantVelocityModel` on **6D SI state**: `mean += v·dt`, `Q = q0·dt·I`.
- **Single injection point** for: dead reckoning, search-ellipse growth, `Fact.half_life` derivation (Phase D).
- Future body: current drift on vx,vy; wind on surface/air domain only; vz constrained by domain.

**Tests:** CV advances position exactly; trace(Q) grows with dt; search ellipse semi-major after Δt
matches horizontal block of Q (not ad-hoc `v_max·Δt` in UI).

### T2.6 — `EnvironmentContext` + imported field storage

Unified shape for all gridded / point environmental imports.

```typescript
type FieldKind = 'salinity_psu' | 'sea_state_hs_m' | 'wind_ms' | 'current_u_ms' | 'current_v_ms' | 'fog_vis_km';

interface EnvironmentSample {
  ts: number;
  x_m: number;
  y_m: number;
  z_m: number;       // signed z-up (or store legacy depth_m in DB, convert at ingest)
  kind: FieldKind;
  value: number;
}

interface EnvironmentContext {
  ts: number;
  sample(kind: FieldKind, pos: Position3): number | null;
}
```

> **Shape change from draft:** use **`Position3`** at engine boundary (A2). DB rows may still store `x_km` / `depth_m` with adapter on load.

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

## A3 — Comms shapes (T2.7) ✅ COMPLETE

Supports imported **link budgets**, **latency**, **multi-hop relay paths**, and per-link contention.

**Shipped:** `buildCommsModel`, `selectActiveLinks`, `findRoute`; `comms_links` + `comms_nodes` tables;
`packages/db/src/comms.ts`; gate evolved to per-link utilization; Supabase integration tests.

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
  pathDelay(sentTs: number, from: string, to: string, ts?: number): number;
  linkUtilization(assignments: Assignment[], ts: number): Map<string, number>;  // key "from:to"

  // A0.7 stub — fallback when linkUtilization map empty
  fleetUsage(assignments: Assignment[], ts: number): number;
  messageDeliveryTs(sentTs: number, from: string, to: string, queryTs?: number): number;
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

## A4 — EnvMult factor registry (connects T2.6 → coverage) ✅ COMPLETE

Refactor `effectiveQuality` to use the extensible product from A0.2:

```typescript
type EnvFactor = (ctx: EnvironmentContext, sensor: SensorSpec, vehicle: VehicleState) => number;

const ENV_FACTORS: EnvFactor[] = [
  motionFactor,           // e^(-k·speed/vmax) — today
  salinityFactor,         // D1 ✅ — PSU curve
  seaStateFactor,         // D1 ✅ — Hs degradation
  fogFactor,              // D1 ✅ — visibility
  beamGainFactor,         // C2 — no-op when beam_half_angle_deg omitted
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
- [x] A1 initial T2.1–T2.4 (2D cv4): estimation modules, `tracks` table, UI search region via `ownAssetSearchUncertainty` (**UI-1**)
- [x] **A1-revise:** 3D `spatial.ts`, cv6 state, slant range, z-up adapter — [A1_REVISE_3D.md](A1_REVISE_3D.md)
- [x] T2.5 `MotionModel` + `ConstantVelocityModel` + search region via propagated Q
- [x] T2.6 `EnvironmentContext` + `environment_samples` migration + `loadEnvironmentContext`
- [x] T2.7 Comms **graph** shape (`route`, `linkUtilization`) + DB tables + integration tests
- [x] A4 envMult factor registry with motion + D1 salinity/sea-state/fog factors
- [x] **UI-1** operator console — plan + profile views, Realtime, scenario API ([HANDOVER.md](HANDOVER.md) § UI-1)
- [ ] Kalman-readiness `test.todo` — **exists** in `estimator.test.ts`; implement in D6
- [x] `pnpm verify` green; engine + rollup + planner purity lints pass (~213 tests, June 2026)
- [x] **C1a** volume patrol AABB + `task_volume_visits` — [C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md)
- [x] **C1b** planner patrol sweep (`patrol:` handles + `planningOverrides`)
- [x] **C2** directional sensors (`beamGainFactor`, `checkPointingGate`, `beam_half_angle_deg`)

---

# PHASE B — Guard tests (Tier 3 prerequisites) ✅ COMPLETE

Prove the rollup and planner DOFs are leaf-agnostic **before** building Tier 3 bodies.

## B1 — Rollup-is-leaf-agnostic (T3.1 guard) ✅

Refactor `computeMissionCoverage` to dispatch:

```typescript
computeTaskLeaf(task, …) → { cov_t, freshnessValues, infeasible }
```

- Point tasks → `computePointTaskLeaf` (existing logic).
- AREA tasks → stub leaf returning `cov_t = 0.7` (replaced by `coverageVolume` in C1).
- Unknown kinds → infeasible.

**Guard tests:** `guard.test.ts` — mixed point + area mission; POINT golden fixture; `lint-rollup-purity.mjs` enforces rollup does not read `task.target_x`, `task.demands`, etc.

## B2 — EnvMult extensibility guard (T3.2 partial) ✅

Explicit gate in `guard.test.ts` + full coverage in `envMult.test.ts` — D1 factors no-op without `EnvironmentContext` (B2 guard).

## B3 — Opaque operating-point guard (T3.2 partial) ✅

`guard.test.ts` — JSON `{bearing: 45}` and `"SLOW"` through `resolveOperatingPoint`; `lint-planner-purity.mjs` forbids planner introspection of handle contents.

**Commit boundary:** `B: tier-3 guard tests`.

---

# PHASE C — Tier 3 bodies (new leaves above rollup) ✅ COMPLETE

## C1 — Area / patrol coverage (T3.1 body) ✅

**Archive spec:** [C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md)

| Sub-phase | Shipped | Notes |
|-----------|---------|-------|
| **C1a** | `coverageVolume`, `footprint`, `task_volume_visits` | AABB v1; mean cell scores per axis; linear revisit decay |
| **C1b** | `patrolSweep.ts`, `planningOverrides` | Finite patrol candidates (≤3 cells); sandbox hypothetical position; no route optimizer |

**Still deferred (body swaps, not rewrites):** polygon footprint · thermocline z band · multi-leg sweep paths · scan/dwell time on `VolumeVisitRecord`

## C2 — Directional sensors + pointing (T3.2 body) ✅

| Item | Shipped |
|------|---------|
| **Beam geometry** | `sensors/beamGeometry.ts` — `beamGain`, `inBeamRange`, `losAnglesDeg`, 3D separation |
| **EnvMult factor** | `beamGainFactor` in `DEFAULT_ENV_FACTORS`; `EnvMultContext.target` for 3D LOS |
| **Pointing** | `bearing_deg` + `elevation_deg` on `ResolvedOperatingPoint`; JSON handle `{bearing, elevation?, speed?}` |
| **Contention gate** | `checkPointingGate` — conflicting bearings on one directional sensor → plan infeasible |
| **DB** | `asset_sensors.beam_half_angle_deg` optional — omit for omnidirectional (backward compatible) |

**Tests:** `directional.test.ts`, `beamGeometry.test.ts`, `patrolSweep.test.ts`; B1/B2/B3 guards still green.

---

# PHASE D — Tier 1 bodies (smart implementations behind frozen shapes)

Bodies can ship in any order once Phase A + B are complete. Mapped to original README stretch steps.

## D1 — Imported environmental data bodies ✅ COMPLETE

| Component | Body | Data source | Status |
|-----------|------|-------------|--------|
| **D1-import** | `packages/env-import/` → `environment_samples` | Open-Meteo Marine + Weather; Copernicus `so` | ✅ |
| `salinityFactor` | PSU deviation curve — `passive_acoustic` | Copernicus via import | ✅ |
| `seaStateFactor` | Hs degradation — surface sensors | Open-Meteo `wave_height` | ✅ |
| `fogFactor` | Visibility cutoff — `eo_ir` | Open-Meteo `visibility` | ✅ |
| **MotionModel drift** | `+ [u,v]·dt` currents + windage | `current_u/v_ms`, `wind_ms`, `wind_direction_deg` | ✅ |
| **UI** | Drawer effective bars + search ellipse drift | Supabase `environment_samples` | ✅ |

**Rule:** import pipeline writes `environment_samples` rows; engine reads via `EnvironmentContext` only.

**Fetch:**

```bash
node apps/orchestrator/dist/cli.js env-fetch --all-ticks
# Copernicus: pip install -r scripts/requirements-env-import.txt
```

**Still deferred within D1:** Sentinel Hub EO fog proxy · grid interpolation beyond nearest-neighbor.

## D2 — Imported comms data bodies (T1.8) ✅ COMPLETE

- `comms_links` graph loaded via `loadCommsModel` (A3 + seed topology).
- `ingestReports` applies `pathDelay` — facts store **delivery ts**; reports held until `now`.
- Gate binds on **per-link utilization** when graph loaded (A3).

## D3 — Threats & risk (README S11, T1.1 body) ✅ COMPLETE

| Component | Body | Status |
|-----------|------|--------|
| **D3 DDL** | `threats`, `no_go_zones` tables | ✅ |
| **D3 engine** | `routePlanner.ts` — `buildRoutePlanner`, `checkNoGoGate` | ✅ |
| **D3 measure** | Straight-line segments belief → task; graded threat discs | ✅ |
| **D3 objective** | `exposure` / `risk` → `computeObjective` via A0.4 terms | ✅ |
| **D3 gate** | No-go intersection prunes plan before scoring (P5) | ✅ |
| **D3 DB** | `packages/db/threats.ts` → `EngineInput.routePlanner` | ✅ |
| **D3 seed** | Offshore hostile contact + fisher exclusion | ✅ |

**Still deferred within D3:** polygon threat/no-go geometry (body swap on same tables or jsonb footprint); multi-waypoint routes.

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
│ Open-Meteo Marine   │──┐  │ EnvironmentContext   │──▶ MotionModel.predict (drift)
│ Open-Meteo Weather  │  ├─▶│ .sample(kind, pos)   │──▶ envMult factors (D1)
│ Copernicus Marine   │──┘  └──────────────────────┘
│ (Python bridge)     │              ▲
└─────────┬───────────┘              │
          │ env-fetch                  │
          ▼                            │
┌─────────────────────┐     loadEnvironmentContext()
│ environment_samples │◀─────────────┘
│ (7 FieldKinds)      │
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
| T2.1 | `Estimate` cv6, `covToEllipse`, `zUncertainty` | A1 | ✅ |
| T2.2 | `Measurement`, `position3Measurement` | A1 | ✅ |
| T2.3 | `Estimator` (6D) | A1 | ✅ |
| T2.4 | `Track`, `Observation`, `UncertaintyRegion` | A1 | ✅ tracks table + types |
| T2.5 | `MotionModel` (6D SI) | A2 | ✅ |
| T2.6 | `EnvironmentContext.sample(kind, Position3)` | A2 | ✅ |
| T2.7 | `CommsModel` graph, `comms_links`, `comms_nodes` | A3 | ✅ |

## Tier 3 — Leaves (Phase C; guards in Phase B)

| ID | Leaf | Guard | Body |
|----|------|-------|------|
| T3.1 | **Volume** patrol coverage | B1 ✅ | C1a ✅ (`coverageVolume`, AABB — [C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md)) |
| T3.1b | Planner patrol sweep | B3 ✅ | C1b ✅ (`patrol:` handles, `planningOverrides`) |
| T3.2 | Directional sensors + **3D pointing** | B2 ✅ + B3 ✅ | C2 ✅ (`beamGainFactor`, `checkPointingGate`, elevation) |

## Tier 1 — Bodies (Phase D)

| ID | Expansion | Seam installed | Body phase |
|----|-----------|----------------|------------|
| T1.1 | Threat routing; exposure/risk | A0.4 ✅ | **D3 ✅** |
| T1.2 | Spoofing | A0.1 ✅ | D4 (S12) |
| T1.3 | LLM summaries | A0.6 ✅ | D5 (S13) |
| T1.4 | Salinity / sea-state / fog | A0.2 ✅ + A4 ✅ | **D1 ✅** |
| T1.5 | Dynamics-aware staleness | half_life field ✅ | D6 |
| T1.6 | Continuous operating points | A0.8 ✅ | D6 |
| T1.7 | Substitutable sensors | A0.3 ✅ | D6 |
| T1.8 | Fleet comms contention | A0.7 ✅ + T2.7 ✅ | **D2 ✅** |
| T1.9 | Objective normalization | A0.4 ✅ | D6 |
| T1.10 | MIP / column-generation | A0.5 ✅ | D6 |
| — | Wind / current motion | T2.5 + T2.6 | **D1 ✅** |
| — | Comms delay in ingest | T2.7 | **D2 ✅** |
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
| S11 Threats & risk | **D3 ✅** (requires A0.4) |
| S12 Scale + spoofing | D4 (requires A0.1) + scale testing after shapes stable |
| S13 LLM narration | D5 (requires A0.6) |
| Deferred: salinity / sea-state / fog | T2.6 + A4 shapes → **D1 ✅** |
| Deferred: dynamics-aware staleness | T2.5 → D6 body |
| Deferred: area coverage | B1 ✅ → **C1a ✅** · C1b ✅ |
| Deferred: directional sensors | B2/B3 ✅ → **C2 ✅** |
| Deferred: comms contention | T2.7 ✅ + A0.7 gate → D2 import body |
| Deferred: MIP solver | A0.5 → D6 body |

---

# Next action

**Phase D4** — spoofing / adversarial data (S12). D1 + D2 + D3 complete.

The **operator console** is the demo surface — D2 UUV reports arrive ~3 ticks after send (multi-hop acoustic path); tick 4 comms loss stacks on delayed delivery. D3 threat/no-go data is in seed (`threat-hostile-surface`, `ngo-fisher-exclusion`).

| Priority | Phase | Why |
|----------|-------|-----|
| **D4** | Spoofing (S12) | `reconcile()` seam ready |
| **D5** | LLM narration (S13) | `summarize()` seam ready |
| **D6** | Kalman, MIP, scan-time/dwell, polygon footprint | Body swaps on existing seams |

**Still deferred:** Sentinel Hub EO proxy · C1-polygon · C1-thermocline · multi-hop patrol · per-cell `dwell_s` · polygon threats.

**Health check:** `pnpm db:verify` (**17/17**) · `pnpm verify` (~**213** tests) · `node apps/orchestrator/dist/cli.js env-fetch 0` · `pnpm --filter @mission-orchestrator/ui dev` → http://localhost:5173

**Live env tests:** `RUN_LIVE_ENV_TESTS=1 pnpm --filter @mission-orchestrator/env-import test`

**DDL reminder:** use Supabase MCP `apply_migration` — not REST keys alone on remote.
