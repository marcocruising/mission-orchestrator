# Mission Orchestrator — Handover

**Date:** June 2026  
**Status:** S0–S10 · **A0–A4** · **B** complete · remote Supabase live (**14 tables**)

**New agent:** Read this file first, then **[C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md)** (full spec). Summary in [EXPANSION_REGISTER.md](EXPANSION_REGISTER.md) § C1.

---

## Agent pickup (start here)

### What to do next — Phase C1a (3D volume patrol, AABB)

**Read [C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md) in full** — locked decisions, types, DDL, algorithm, file list.

1. **C1.1** — `packages/engine/src/volume/footprint.ts`: `Footprint` union, `discretizeFootprint` (AABB only) + tests.
2. **C1.2** — `coverageVolume.ts` + tests (synthetic fixture, no DB).
3. **C1.3** — Replace `computeAreaTaskLeafStub` in `stateEngine.ts`; update `guard.test.ts` (AREA ≠ constant 0.7).
4. **C1.4** — Migration `c1_volume_patrol` via Supabase MCP; `packages/db/src/volume.ts`; update `verify-supabase.mjs` → **15/15** tables.
5. **C1.5** — Load/save `task_volume_visits` on tick via `buildEngineInputFromDb` + orchestrator persist.
6. **C1.6** — Optional demo seed (subsurface AABB patrol); run health check below.
7. **Stop** — do not start C2 or **C1b** (planner sweep) until user confirms.

### Locked for C1 (do not change without user)

- **AABB footprint** in `footprint jsonb` — polygon is later `discretizeFootprint` body swap.
- **Opaque `cell_id`** visit keys — not `(i,j,k)` indices.
- **Per-cell `effectiveQuality`** — env/currents/thermocline via existing seams, not volume-specific formulas.
- **Fixed z band** — no thermocline tracking in C1.

### Do not skip

- **B guards must stay green** — `lint-rollup-purity`, `lint-planner-purity`, `guard.test.ts`.
- **Engine purity** — no DB imports inside `packages/engine`.
- **Gate before grade** (P5) — hard cutoffs prune before scoring.
- **One step at a time** — green suite between steps.

### Quick health check

```bash
pnpm db:verify && pnpm verify && node apps/orchestrator/dist/cli.js inspect
```

Expected: **15/15** tables after C1 · **~185+** tests · rollup + planner lints green · fleet/mission output.

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
| `DEFAULT_ENV_FACTORS` | `[motion, salinity, seaState, fog]` — no behavior change until D1 import |

### Phase B — Guard tests

| Guard | What shipped |
|-------|----------------|
| **B1** | `computeTaskLeaf` dispatch; AREA stub (0.7); `guard.test.ts`; `lint-rollup-purity.mjs` |
| **B2** | Explicit envMult extensibility gate in `guard.test.ts` |
| **B3** | JSON bearing + planner opaque-handle tests; `lint-planner-purity.mjs` |

---

## Not started (ordered)

| Phase | Scope |
|-------|--------|
| **C1a** | 3D AABB volume patrol — `coverageVolume`, `task_volume_visits` ← **NEXT** ([C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md)) |
| **C1b** | Planner sweep paths through volume (deferred) |
| **C2** | Directional sensors + 3D pointing (`inBeamRange`, elevation) |
| **D** | Imported data bodies, S11–S13 (threats, spoofing, LLM) |

---

## Repository layout

```
packages/engine/     Pure logic — zero DB deps, Vitest property tests
  spatial.ts         Position3, z-up, slant range (A1)
  estimate.ts        cv6 Estimate, migrateEstimate (A1)
  motionModel.ts     ConstantVelocityModel, propagateState (A2)
  environmentContext.ts  FieldKind, sample(), static/grid bodies (A2)
  commsModel.ts      buildCommsModel, route, linkUtilization (A3)
  envFactors/        salinity, seaState, fog stubs (A4)
  guard.test.ts      B1/B2/B3 guard tests
  coverage.ts        slantRangeKm, effectiveQuality + env ctx (A1/A2/A4)
  searchRegion.ts    ownAssetSearchUncertainty via MotionModel (A1/A2)
  stateEngine.ts     computeTaskLeaf dispatch (B1); AREA stub → C1 coverageVolume
  volume/            C1: footprint.ts, coverageVolume.ts (create)
  …                  reconcile, envMult, objective, planner, summarize, operatingPoint
packages/db/         Supabase loaders
  missions.ts        buildEngineInputFromDb (belief, missions, env, comms, …)
  environment.ts     loadEnvironmentContext (A2)
  comms.ts           loadCommsModel (A3)
  comms.integration.test.ts  Live Supabase comms round-trip
  tracks.ts          parseTrackRow + migrateEstimate (A1)
apps/orchestrator/   CLI: inspect | sim | tick | apply
apps/ui/             Vite + React Realtime dashboard
supabase/migrations/ S0–A3 DDL (local source of truth; apply remote via MCP)
scripts/             lint-engine.mjs, lint-rollup-purity.mjs, lint-planner-purity.mjs, verify-supabase.mjs
EXPANSION_REGISTER.md  Canonical plan
C1_VOLUME_PATROL.md    **C1 agent pickup spec (AABB v1)** — read before coding
A1_REVISE_3D.md      A1 3D spec (complete — reference only)
```

---

## Remote Supabase

**Project:** `wyeryyczsdezyvrsqxep` (must match `.env` **and** Cursor Supabase MCP)

| Channel | Use for |
|---------|---------|
| **Supabase MCP** | DDL — `apply_migration`, `list_tables`, `list_migrations` |
| **`.env` REST keys** | Runtime — orchestrator, UI, `pnpm db:verify`, integration tests |

**MCP migrations applied:** `s0_config` … `a1_tracks`, `a2_environment_samples`, `a3_comms_graph`

- **14/14** tables reachable via REST
- RLS enabled; anon read; service role writes
- Demo seed: 2 assets, 2 missions, 2 assignments, 13 config keys; `environment_samples` / `comms_links` empty by default (stubs via engine)

```bash
pnpm db:verify    # REST — expect 14/14 tables
pnpm verify       # lint + build + ~181 tests
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
                                                              ↓
assignments + missionDefs + belief + commsModel + motionModel + environmentContext
                              ↓
                    computeTaskLeaf → recomputeMissionStates (PURE)
                              ↓
              Monitor → summarize() → salience gate → Planner.replan()
                              ↓
              applyPlan (re-validate gates incl. CommsModel) → assignments
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
| `pnpm db:verify` | 14/14 tables, anon RLS OK |
| `pnpm verify` | ~181 passed, 1 todo (Kalman-readiness) |
| Engine purity lint | Passed |
| Rollup leaf-agnostic lint | Passed |
| Planner opaque-handle lint | Passed |
| Supabase comms integration | 4/4 live tests passed |

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

---

## Known gaps (non-blocking)

1. **C1a–C1b** — Volume patrol: [C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md) (AABB v1 next; polygon/sweep deferred)
2. **Alert demo tuning** — salience ≥ 0.4 with default seed
3. **UI Accept** — wire to orchestrator API / Edge Function
4. **Sim idempotency** — upsert or `--force`
5. **UAV seed scenario** — `z_m` belief fact for air-domain demo
6. **D2 ingest delay** — `ingestReports` does not yet apply `pathDelay` (shape ready in A3)

---

## Key files for C1a

| File | Purpose |
|------|---------|
| **[C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md)** | **Primary pickup spec** — types, DDL, algorithm, steps |
| `packages/engine/src/volume/footprint.ts` | `Footprint`, `discretizeFootprint` (AABB) |
| `packages/engine/src/volume/coverageVolume.ts` | Volume leaf body |
| `packages/engine/src/stateEngine.ts` | Replace `computeAreaTaskLeafStub` |
| `packages/engine/src/guard.test.ts` | B1 guard — update AREA expectations |
| `packages/db/src/volume.ts` | Load/save `task_volume_visits` |
| `scripts/lint-rollup-purity.mjs` | Must stay green — do not touch rollup |
