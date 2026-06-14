# Mission Orchestrator — Handover

**Date:** June 2026  
**Status:** S0–S10 · **A0–A4** · **B** · **C (C1a–C1b + C2)** complete · remote Supabase live (**15 tables**)

**New agent:** Read this file first, then **[EXPANSION_REGISTER.md](EXPANSION_REGISTER.md)** § Phase D. C1 archive: [C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md).

---

## Agent pickup (start here)

### What to do next — Phase D (Tier 1 bodies)

Phase **C is complete** (volume patrol, planner sweep, directional sensors). Next work is **body swaps** behind frozen interfaces — any order; see register for suggested priority.

| Phase | Scope | Seam already installed |
|-------|--------|------------------------|
| **D1** | Real salinity / sea-state / fog / current bodies | `EnvironmentContext`, `envMult` factors, `MotionModel` |
| **D2** | Comms import + ingest `pathDelay` | `CommsModel` graph, per-link gate |
| **D3** | Threats, exposure, risk (S11) | `ObjectiveTerm[]` (=0 today) |
| **D4** | Spoofing (S12) | `reconcile()` |
| **D5** | LLM summaries (S13) | `summarize()` |
| **D6** | Kalman, MIP, scan-time/dwell, polygon footprint | Estimator, Planner, `VolumeVisitRecord`, `Footprint` |

**Recommended first step:** **D1** — wire `environment_samples` import so stub factors return real values.

### Do not skip

- **B guards must stay green** — `lint-rollup-purity`, `lint-planner-purity`, `guard.test.ts`.
- **Engine purity** — no DB imports inside `packages/engine`.
- **`planningOverrides` sandbox-only** — never set on live tick (W15).
- **Gate before grade** (P5) — hard cutoffs prune before scoring.
- **One step at a time** — tests first, green suite, stop between steps.

### Quick health check

```bash
pnpm db:verify && pnpm verify && node apps/orchestrator/dist/cli.js inspect
```

Expected: **15/15** tables · ~**200** tests (1 Kalman `test.todo`) · all lints green.

---

## What this is

Single-operator decision support for a fleet of unmanned naval vehicles. When a vehicle fails or degrades, the system:

1. Maintains **belief** from noisy/delayed reports (never reads ground truth in the engine)
2. Recomputes **MissionState** each tick (coverage, confidence, impact, urgency, salience)
3. Raises alerts when salience crosses a gate
4. Generates and ranks **reassignment plans** (including do-nothing)
5. Commits plans via **applyPlan** with re-validation against current belief

---

## What was accomplished

### Original build (S0–S10)

| Step | Deliverable | Status |
|------|-------------|--------|
| **S0** | pnpm monorepo, Supabase migrations scaffold, CI engine-purity guardrail, `.env.example` | Done |
| **S1** | Pure types, `Fact`/`Belief`, half-life `freshness` | Done |
| **S2** | World/belief schema, `Simulator`, `ingestReports`, `inspect` CLI | Done |
| **S3** | Coverage engine + property tests (gate-before-grade, min/weighted-avg, P6) | Done |
| **S4** | Missions/assignments schema, DB→engine adapter | Done |
| **S5** | Full `MissionState` + persistence, sticky `cov_baseline` | Done |
| **S6** | `Monitor.scan`, salience gate, alert summaries | Done |
| **S7** | Planner: sandbox re-eval, do-nothing baseline, `Obj` ranking | Done |
| **S8** | `applyPlan` re-validation, `decision_log`, tick loop CLI | Done |
| **S9** | React UI: map, search ellipses, mission tiles, recommendation panel | Done |
| **S10** | Operating-point candidates (`STATION`/`SLOW`/`FAST`) | Done |

### Phase A0 — Seam retrofits

| Step | Module | What it enables |
|------|--------|-----------------|
| **A0.1** | `reconcile.ts` | Spoofing / conflicting reports (D4) |
| **A0.2** | `envMult.ts` | Salinity, sea-state, fog factors (D1) — factor list |
| **A0.3** | `coverage.ts` | Substitutable sensors (D6) — injectable aggregator |
| **A0.4** | `objective.ts` | Threats/risk, fuel/comms costs (D3/D6) — `ObjectiveTerm[]` |
| **A0.5** | `planner.ts` | MIP / column-generation (D6) — `Planner.replan()` |
| **A0.6** | `summarize.ts` | LLM narration (D5) — swappable `Summarizer` |
| **A0.7** | `commsModel.ts` | Fleet comms gate (D2) — graph body in A3 |
| **A0.8** | `operatingPoint.ts` | Directional sensors (C2) — opaque resolver |

### Phase A1 — Estimation + 3D spatial (incl. A1-revise)

| Module | What shipped |
|--------|----------------|
| `spatial.ts` | `Position3`, z-up adapters, `slantRangeM`, `rangeKm` |
| `estimate.ts` | cv6 `Estimate`, `migrateEstimate`, `zUncertainty` |
| `measurement.ts` | `position3Measurement`, `horizontalBearingMeasurement` (meters) |
| `estimator.ts` | 6D `FixedGainEstimator` |
| `coverage.ts` | `slantRangeKm` via spatial seam |
| `searchRegion.ts` | `ownAssetSearchUncertainty` — MotionModel-propagated 6D reachable set |
| `track.ts` / `tracks` | External contact tracks; `migrateEstimate` on DB load |
| UI | Map ellipse + z σ label on comms loss |

Spec archive: [A1_REVISE_3D.md](A1_REVISE_3D.md) (complete).

### Phase A2 — Motion + environment shapes

| Module | What shipped |
|--------|----------------|
| `motionModel.ts` | `MotionModel`, `ConstantVelocityModel`, `propagateState`, `initialLostContactState` |
| `environmentContext.ts` | `EnvironmentContext`, `staticEnvironmentContext`, `sampleEnvironmentContext`, `buildEnvironmentContext` |
| `EngineInput` | + `motionModel`, `environmentContext` (injected each tick) |
| `effectiveQuality` | Plumbs `environmentContext` into `envMult` ctx |
| `packages/db/environment.ts` | `loadEnvironmentContext()` from `environment_samples` |
| Supabase | `environment_samples` table (applied via MCP `a2_environment_samples`) |

### Phase A3 — Comms graph

| Module | What shipped |
|--------|----------------|
| `commsModel.ts` | `buildCommsModel`, `route`, `pathDelay`, `linkUtilization`; `messageDeliveryTs(..., queryTs?)` |
| `checkFleetCommsGate` | Per-link utilization ≤ 1 when graph loaded; `fleetUsage` fallback |
| `packages/db/comms.ts` | `loadCommsLinks`, `loadCommsModel` → `buildEngineInputFromDb` |
| Supabase | `comms_links`, `comms_nodes` (MCP `a3_comms_graph`) |
| Tests | `commsModel.test.ts` (12); `comms.integration.test.ts` (live Supabase round-trip) |

### Phase A4 — EnvMult factor registry

| Module | What shipped |
|--------|----------------|
| `envFactors/salinityFactor.ts` | Stub → 1.0; samples `salinity_psu` |
| `envFactors/seaStateFactor.ts` | Stub → 1.0; samples `sea_state_hs_m` |
| `envFactors/fogFactor.ts` | Stub → 1.0; samples `fog_vis_km` |
| `DEFAULT_ENV_FACTORS` | `[motion, salinity, seaState, fog, beamGain]` — env stubs until D1; beamGain no-op when omnidirectional |

### Phase B — Guard tests

| Guard | What shipped |
|-------|----------------|
| **B1** | `computeTaskLeaf` dispatch; dynamic AREA leaf; `guard.test.ts`; `lint-rollup-purity.mjs` |
| **B2** | Explicit envMult extensibility gate in `guard.test.ts` |
| **B3** | JSON bearing + planner opaque-handle tests; `lint-planner-purity.mjs` |

### Phase C — Tier 3 bodies

| Step | Module | What shipped |
|------|--------|----------------|
| **C1a** | `volume/footprint.ts`, `coverageVolume.ts` | 3D AABB patrol; `task_volume_visits`; revisit decay |
| **C1a DB** | `c1_volume_patrol`, `packages/db/volume.ts` | `tasks.kind`, footprint jsonb; visit load/save on tick |
| **C1b** | `volume/patrolSweep.ts`, `planningOverrides` | `patrol:cell_id` handles; sandbox hypothetical positions; ≤3 candidates |
| **C2** | `sensors/beamGeometry.ts`, `beamGainFactor.ts`, `pointingGate.ts` | Directional cone; `beam_half_angle_deg`; pointing contention gate |
| **C2 wire** | `vehicleState.ts`, `operatingPoint` + `elevation_deg` | Unified vehicle build; JSON `{bearing, elevation?, speed?}` |

**Tests added:** `footprint.test.ts`, `coverageVolume.test.ts`, `patrolSweep.test.ts`, `beamGeometry.test.ts`, `directional.test.ts`.

---

## Not started (ordered)

| Phase | Scope |
|-------|--------|
| **D1** | Imported environmental data bodies ← **recommended next** |
| **D2** | Comms import + ingest delay |
| **D3–D5** | Threats (S11), spoofing (S12), LLM (S13) |
| **D6** | Kalman, MIP, scan-time/dwell, polygon footprint, substitutable sensors |
| **C1-future** | Polygon footprint · thermocline z band · multi-leg patrol routes (body swaps) |

---

## Repository layout

```
packages/engine/     Pure logic — zero DB deps, Vitest property tests
  spatial.ts         Position3, z-up, slant range (A1)
  estimate.ts        cv6 Estimate, migrateEstimate (A1)
  motionModel.ts     ConstantVelocityModel, propagateState (A2)
  environmentContext.ts  FieldKind, sample(), static/grid bodies (A2)
  commsModel.ts      buildCommsModel, route, linkUtilization (A3)
  envFactors/        salinity, seaState, fog, beamGain (A4 + C2)
  sensors/           beamGeometry.ts (C2)
  guard.test.ts      B1/B2/B3 guard tests
  directional.test.ts  C1b + C2 integration tests
  coverage.ts        slantRangeKm, effectiveQuality + env ctx (A1/A2/A4/C2)
  searchRegion.ts    ownAssetSearchUncertainty via MotionModel (A1/A2)
  stateEngine.ts     computeTaskLeaf; volumeVisits; planningOverrides (C1)
  volume/            footprint, coverageVolume, patrolSweep (C1)
  vehicleState.ts    buildVehicleState — belief + pointing + sandbox override
  pointingGate.ts    checkPointingGate (C2)
  …                  reconcile, envMult, objective, planner, summarize, operatingPoint
packages/db/         Supabase loaders
  missions.ts        buildEngineInputFromDb (belief, missions, env, comms, volumeVisits)
  volume.ts          load/save task_volume_visits (C1)
  environment.ts     loadEnvironmentContext (A2)
  comms.ts           loadCommsModel (A3)
  tracks.ts          parseTrackRow + migrateEstimate (A1)
apps/orchestrator/   CLI: inspect | sim | tick | apply (tick persists volume visits)
apps/ui/             Vite + React Realtime dashboard
supabase/migrations/ S0–C2 DDL (local source of truth; apply remote via MCP)
scripts/             lint-engine.mjs, lint-rollup-purity.mjs, lint-planner-purity.mjs, verify-supabase.mjs
EXPANSION_REGISTER.md  Canonical plan — **Phase D next**
C1_VOLUME_PATROL.md    C1 archive (complete — reference for volume patrol)
A1_REVISE_3D.md      A1 3D spec (complete — reference only)
```

---

## Remote Supabase

**Project:** `wyeryyczsdezyvrsqxep` (must match `.env` **and** Cursor Supabase MCP)

| Channel | Use for |
|---------|---------|
| **Supabase MCP** | DDL — `apply_migration`, `list_tables`, `list_migrations` |
| **`.env` REST keys** | Runtime — orchestrator, UI, `pnpm db:verify`, integration tests |

**MCP migrations applied:** `s0_config` … `a3_comms_graph`, `c1_volume_patrol`, `c2_directional_sensors`

- **15/15** tables reachable via REST
- RLS enabled; anon read; service role writes
- Demo seed: 3 missions (incl. `mission-volume` AREA patrol), 2 assets, assignments, 13 config keys

```bash
pnpm db:verify    # REST — expect 15/15 tables
pnpm verify       # lint + build + ~200 tests
```

---

## How to run

### Prerequisites

Node 22+, pnpm 9+, `.env` with `SUPABASE_URL`, keys, and `VITE_*` copies (see `.env.example`).

### One-time

```bash
pnpm install && pnpm build && pnpm db:verify
```

### Terminal demo

```bash
node apps/orchestrator/dist/cli.js sim 0 && node apps/orchestrator/dist/cli.js tick 0
node apps/orchestrator/dist/cli.js inspect

# Comms-cut scenario (tick 2)
node apps/orchestrator/dist/cli.js sim 2 && node apps/orchestrator/dist/cli.js tick 2
```

### UI

```bash
pnpm --filter @mission-orchestrator/ui dev   # → http://localhost:5173
```

---

## Architecture (frozen seams)

```
Simulator → reports → ingestReports → reconcile() → belief_facts
environment_samples ──→ loadEnvironmentContext() ──→ EnvironmentContext
comms_links ──→ loadCommsModel() ──→ CommsModel (route, linkUtilization, pathDelay)
task_volume_visits ──→ loadVolumeVisits() ──→ EngineInput.volumeVisits
                                                              ↓
assignments + missionDefs + belief + commsModel + motionModel + environmentContext
                              ↓
                    computeTaskLeaf → recomputeMissionStatesWithVisits (PURE)
                              ↓
              Monitor → summarize() → salience gate → Planner.replan()
                    (patrol: handles + planningOverrides in sandbox only)
                              ↓
              applyPlan (gates: capacity, comms, pointing) → assignments
```

**Invariants (CI enforces #1, #2, #6):**

1. Engine reads `belief`, never `world_truth`
2. State engine is pure — `now` always a parameter; models injected on `EngineInput`
3. Capability is a sensor vector
4. Do-nothing plan always evaluated
5. All assignment changes via `applyPlan`
6. Coverage and confidence never multiplied
7. New fields additive only

---

## Test results (last session)

| Check | Result |
|-------|--------|
| `pnpm db:verify` | 15/15 tables, anon RLS OK |
| `pnpm verify` | ~200 passed, 1 todo (Kalman-readiness) |
| Engine purity lint | Passed |
| Rollup leaf-agnostic lint | Passed |
| Planner opaque-handle lint | Passed |
| Supabase comms integration | Live tests passed |
| C1/C2 tests | `directional.test.ts`, `patrolSweep.test.ts`, `beamGeometry.test.ts` green |

**Demo note:** Default seed may keep salience below σ=0.4 — tune seed or timeline for alert→plan demo.

---

## Learnings (read before coding)

1. **Supabase MCP vs `.env`** — MCP for DDL; REST for runtime. Re-link MCP if project ref drifts from `SUPABASE_URL`.
2. **`freshness(H) = 0.5`** — implemented as `0.5^(Δt/H)`, not `exp(−Δt/H)`.
3. **Engine purity lint** (`scripts/lint-engine.mjs`) — do not remove.
4. **Rollup lint** (`scripts/lint-rollup-purity.mjs`) — `computeMissionCoverage` must stay leaf-agnostic.
5. **Planner lint** (`scripts/lint-planner-purity.mjs`) — no `operating_point` introspection in planner.
6. **Root script is `verify`**, not `ci` (pnpm reserves `ci`).
7. **Sim re-runs** — `world_truth` PK duplicates; needs upsert/`--force` (known gap).
8. **A0.3 ≠ confidence** — aggregator is sensor-axis coverage; confidence is min freshness.
9. **Comms is a graph (W5)** — per-link utilization; `messageDeliveryTs` needs `queryTs = input.now`.
10. **3D spatial (A1)** — `Position3` + z-up; **`z_m = -depth_m` only in `spatial.ts`**.
11. **Operating points opaque to planner** — resolved only in `resolveOperatingPoint`.
12. **One step at a time** — tests first, green suite, stop between steps.
13. **Volume patrol (C1)** — belief position drives live coverage; `planningOverrides` only in planner sandbox (W15).
14. **Patrol handles** — `patrol:c:…` lowercase prefix; resolved to SLOW speed in `resolveOperatingPoint`; cell id opaque to planner (W16).
15. **Directional sensors** — omit `beam_half_angle_deg` for omnidirectional; passive_acoustic demo unchanged (W17).
16. **Decay test pattern** — move vehicle out of range when testing revisit decay, or visits refresh every tick (C1 lesson).
17. **Scan time / dwell (future)** — extend `VolumeVisitRecord` + `cellVisitScore` body or add `ObjectiveTerm`; do not reshape rollup (W18).
18. **Mixed POINT+AREA guard** — AREA tasks need assignments on the AREA task_id to get non-zero coverage.

---

## Known gaps (non-blocking)

1. **Phase D** — imported data, threats, spoofing, LLM, Kalman, scan-time (seams ready)
2. **C1-future** — polygon footprint · thermocline z band · multi-leg patrol · per-cell `dwell_s`
3. **Alert demo tuning** — salience ≥ 0.4 with default seed
4. **UI Accept** — wire to orchestrator API / Edge Function
5. **Sim idempotency** — upsert or `--force`
6. **UAV seed scenario** — `z_m` belief fact for air-domain demo
7. **D2 ingest delay** — `ingestReports` does not yet apply `pathDelay` (shape ready in A3)

---

## Key files for Phase D

| File | Purpose |
|------|---------|
| **[EXPANSION_REGISTER.md](EXPANSION_REGISTER.md)** | **Primary pickup** — Phase D scope, tier reference |
| `packages/engine/src/envFactors/` | D1 — replace stub bodies (salinity, seaState, fog) |
| `packages/engine/src/environmentContext.ts` | D1 — grid/interpolation body |
| `packages/engine/src/commsModel.ts` | D2 — import-driven graph body |
| `packages/engine/src/ingest.ts` | D2 — apply `pathDelay` on delivery |
| `packages/engine/src/objective.ts` | D3 — exposure/risk terms |
| `packages/engine/src/reconcile.ts` | D4 — spoofing body |
| `packages/engine/src/summarize.ts` | D5 — LLM body |
| `packages/engine/src/volume/footprint.ts` | D6/C1-future — polygon discretizer body swap |
