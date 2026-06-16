# Mission Orchestrator — Handover

**Date:** June 2026  
**Status:** S0–S10 · **A0–A4** · **B** · **C (C1a–C1b + C2)** · **UI-1** · **D1** · **D2** · **D3 (threats / exposure / risk)** complete · remote Supabase live (**17 tables**)

**New agent:** Read this file first, then **[EXPANSION_REGISTER.md](EXPANSION_REGISTER.md)** § Phase D (**D4 next**). Demo UI: [SCENARIO_OFFSHORE.md](SCENARIO_OFFSHORE.md). C1 archive: [C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md).

---

## Agent pickup (start here)

### What to do next — Phase D (Tier 1 bodies)

Phase **D1–D3 are complete** (env import + factors + motion drift; comms graph + ingest `pathDelay`; threats + route exposure/risk). Next recommended work:

| Phase | Scope | Seam already installed |
|-------|--------|------------------------|
| **D4** | Spoofing (S12) | `reconcile()` |
| **D5** | LLM summaries (S13) | `summarize()` |
| **D6** | Kalman, MIP, scan-time/dwell, polygon footprint | Estimator, Planner, `VolumeVisitRecord`, `Footprint` |

**Recommended next step:** **D4** — spoofing / adversarial data via `reconcile()` body (S12).

### Do not skip

- **B guards must stay green** — `lint-rollup-purity`, `lint-planner-purity`, `guard.test.ts`.
- **Engine purity** — no DB imports inside `packages/engine`.
- **`planningOverrides` sandbox-only** — never set on live tick (W15).
- **Gate before grade** (P5) — hard cutoffs prune before scoring.
- **One step at a time** — tests first, green suite, stop between steps.

### Quick health check

```bash
pnpm db:verify && pnpm verify && node apps/orchestrator/dist/cli.js inspect
pnpm --filter @mission-orchestrator/ui dev   # → http://localhost:5173
```

Expected: **17/17** tables · ~**213** tests (1 Kalman `test.todo`) · all lints green · operator console loads with scenario tick controls.

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
| **S9** | Operator console UI (Realtime + scenario API) | Done — superseded by **UI-1** |
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
| UI | Map ellipse + z σ label on comms loss → **UI-1** dual tactical view |

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
| `envFactors/salinityFactor.ts` | Real PSU curve — `passive_acoustic` only (D1) |
| `envFactors/seaStateFactor.ts` | Hs degradation — surface `eo_ir` / `passive_acoustic` (D1) |
| `envFactors/fogFactor.ts` | Visibility degradation — `eo_ir` only (D1) |
| `envFactors/curves.ts` | Shared graded multipliers (D1) |
| `DEFAULT_ENV_FACTORS` | `[motion, salinity, seaState, fog, beamGain]` — D1 bodies live when env loaded |

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

### UI-1 — Operator console frontend

| Item | What shipped |
|------|----------------|
| **Design source** | [`example_operator_console_design.html`](example_operator_console_design.html) — static mock → React |
| **Layout** | Header (mission pills) · fleet rail · dual stage (plan view + water-column profile) · decision column · timeline |
| **Plan view** | `PlanView.tsx` — pipeline corridor, volume visit cells, rig, domain chevrons, pulsing search ellipses |
| **Profile view** | `ProfileView.tsx` — signed z-up water column, surface/seabed strata, asset depths |
| **Decision column** | Alerts (`alert_log`), ranked plans (`plan_eval` + `candidate_plans`), Accept → `applyPlan` |
| **Asset drawer** | Sensor base vs effective bars (`effectiveQuality`), assignment + operating point readout |
| **Scenario controls** | Timeline scrubber — `/api/tick/next`, `/api/tick/goto`, `/api/reset` via Vite plugin |
| **Data** | Supabase Realtime on `belief_facts`, `mission_state`, `plan_eval`, `alert_log`, `task_volume_visits`, `environment_samples` |
| **Env in UI** | Asset drawer effective bars + drift-aware search ellipses when `environment_samples` loaded (D1) |
| **Demo scenario** | Offshore pipeline & rig — [SCENARIO_OFFSHORE.md](SCENARIO_OFFSHORE.md) |

### Phase D1 — Imported environmental data ✅

| Step | Module | What shipped |
|------|--------|----------------|
| **D1-import** | `packages/env-import/` | Open-Meteo Marine + Weather, Copernicus salinity (Python bridge) → `environment_samples` |
| **D1-import CLI** | `env-fetch` | `orchestrator env-fetch [tick] \| --all-ticks` · `--skip-copernicus` |
| **D1-import wire** | `scenario-run.ts` | `replayToTick` auto-runs `env-fetch --all-ticks` after reset |
| **D1 geo** | `offshore-pipeline.ts` | North Sea anchor 56.5°N, 1.0°E · 5×5 grid · depths 0 m + 60 m |
| **D1 factors** | `envFactors/curves.ts`, `salinityFactor`, `seaStateFactor`, `fogFactor` | Graded multipliers; no-op without `EnvironmentContext` (B2 guard preserved) |
| **D1.2 motion** | `motionModel.ts` | `environmentDriftMs` — current u/v + surface/air windage; search ellipse center shifts |
| **D1 FieldKind** | `environmentContext.ts` | + `wind_direction_deg` (additive) |
| **D1 validation** | `validateSamples.ts` | Physical range checks before upsert; live tests with `RUN_LIVE_ENV_TESTS=1` |
| **D1 DB** | `packages/db/environment.ts` | `upsertEnvironmentSamples()` |

**External APIs:** Open-Meteo (no key) · Copernicus Marine (`COPERNICUSMARINE_*` + `scripts/copernicus-env-subset.py`) · Sentinel Hub credentials in `.env.example` (not wired yet).

**Typical fetch:** ~200 rows/tick (150 Open-Meteo + 50 Copernicus salinity at surface + seafloor).

### Phase D2 — Comms pathDelay in ingest ✅

| Step | Module | What shipped |
|------|--------|----------------|
| **D2 ingest** | `packages/engine/src/ingest.ts` | `ingestReports(..., { commsModel, now })` — delivery ts via `messageDeliveryTs`; holds reports until `now` |
| **D2 wire** | `apps/orchestrator/src/tick.ts` | Rebuilds belief from all reports ≤ tick with DB-loaded `CommsModel` |
| **D2 wire** | `apps/orchestrator/src/cli.ts` | `sim` + local `inspect` use comms graph |
| **D2 topology** | `offshore-pipeline.ts`, `seed.sql` | Relay buoy + acoustic gateway + sat terminal; UUV 3-hop, USV/UAV 2-hop |
| **D2 DB** | `packages/db/belief.ts` | `loadReportsUpTo()` for cumulative delayed delivery |

**Sim clock:** tick index = time unit; `delay_s` in seed = one tick per hop (UUV reports arrive ~3 ticks after send).

### Phase D3 — Threats & exposure / risk ✅

| Step | Module | What shipped |
|------|--------|----------------|
| **D3 engine** | `packages/engine/src/routePlanner.ts` | `ThreatZone`, `NoGoZone`, `buildRoutePlanner`, `checkNoGoGate`; straight-line route segments belief → task |
| **D3 measure** | `RoutePlanner.measure()` | **exposure** = max geographic proximity [0,1]; **risk** = max intensity × proximity |
| **D3 gate** | `checkNoGoGate` | Hard prune before scoring (P5); wired in planner eval + `applyPlan` commit |
| **D3 planner** | `planner.ts` | `computeObjective` receives live exposure/risk; `plan_eval.total_exposure` populated |
| **D3 DDL** | `d3_threats` migration | `threats`, `no_go_zones` tables |
| **D3 DB** | `packages/db/threats.ts` | `loadThreats`, `loadNoGoZones`, `loadRoutePlanner` → `buildEngineInputFromDb` |
| **D3 seed** | `seed.sql`, `offshore-pipeline.ts` | Hostile surface contact (6, 10) + fisher exclusion no-go (4.5, 9.5) |
| **D3 tests** | `routePlanner.test.ts` | Geometry, monotonicity, no-go gate, planner pruning |

**Commit boundary:** `D3: threats and route exposure/risk`.

---

## Not started (ordered)

| Phase | Scope |
|-------|--------|
| **D4–D5** | Spoofing (S12), LLM (S13) ← **D4 recommended next** |
| **D6** | Kalman, MIP, scan-time/dwell, polygon footprint, substitutable sensors |
| **C1-future** | Polygon footprint · thermocline z band · multi-leg patrol routes (body swaps) |
| **D1-future** | Sentinel Hub EO fog proxy · grid interpolation body (nearest-neighbor OK for v1) |

---

## Repository layout

```
packages/engine/     Pure logic — zero DB deps, Vitest property tests
  spatial.ts         Position3, z-up, slant range (A1)
  estimate.ts        cv6 Estimate, migrateEstimate (A1)
  motionModel.ts     ConstantVelocityModel + environmentDriftMs (D1.2)
  environmentContext.ts  FieldKind (+ wind_direction_deg), sample(), buildEnvironmentContext (A2)
  commsModel.ts      buildCommsModel, route, linkUtilization (A3)
  envFactors/        curves, salinity, seaState, fog, beamGain (D1 bodies + C2)
  sensors/           beamGeometry.ts (C2)
  guard.test.ts      B1/B2/B3 guard tests
  directional.test.ts  C1b + C2 integration tests
  coverage.ts        slantRangeKm, effectiveQuality + env ctx (A1/A2/A4/C2)
  searchRegion.ts    ownAssetSearchUncertainty — MotionModel + optional EnvironmentContext (D1.2)
  stateEngine.ts     computeTaskLeaf; volumeVisits; planningOverrides (C1)
  volume/            footprint, coverageVolume, patrolSweep (C1)
  vehicleState.ts    buildVehicleState — belief + pointing + sandbox override
  pointingGate.ts    checkPointingGate (C2)
  routePlanner.ts    buildRoutePlanner, checkNoGoGate, exposure/risk measure (D3)
  …                  reconcile, envMult, objective, planner, summarize, operatingPoint
packages/db/         Supabase loaders
  missions.ts        buildEngineInputFromDb (belief, missions, env, comms, volumeVisits, routePlanner)
  volume.ts          load/save task_volume_visits (C1)
  environment.ts     loadEnvironmentContext, upsertEnvironmentSamples (A2 + D1)
  comms.ts           loadCommsModel (A3)
  threats.ts         loadThreats, loadNoGoZones, loadRoutePlanner (D3)
  tracks.ts          parseTrackRow + migrateEstimate (A1)
packages/env-import/ Open-Meteo + Copernicus fetchers, validateSamples (D1-import)
  openMeteoMarine.ts / openMeteoWeather.ts / copernicusMarine.ts / fetchEnvironment.ts
apps/orchestrator/   CLI + scenario API: inspect | sim | tick | apply | scenario | env-fetch
  env-fetch.ts       runEnvFetch → upsert environment_samples
  api-handlers.ts    HTTP handlers (tick, reset, apply-plan)
  scenario-run.ts    Offshore replay; auto env-fetch on reset (D1)
  scenarios/         offshore-pipeline.ts — demo fleet + timeline
apps/ui/             Operator console (Vite + React)
  src/App.tsx        Console shell, Realtime subscriptions, scenario controls
  src/PlanView.tsx   Top-down tactical chart
  src/ProfileView.tsx  Water-column profile (signature dual view)
  src/lib.ts         Supabase client, environmentContextFromDbRows, effectiveQuality + env (D1)
  src/styles.css     Maritime ink design system (from design mock)
  orchestrator-api-plugin.ts  Dev-only: proxy /api/* to orchestrator handlers
example_operator_console_design.html  Design spec / binding reference (static mock)
SCENARIO_OFFSHORE.md  Offshore demo runbook
supabase/migrations/ S0–D3 DDL (local source of truth; apply remote via MCP)
scripts/             lint-engine.mjs, lint-rollup-purity.mjs, lint-planner-purity.mjs, verify-supabase.mjs
  copernicus-env-subset.py   Copernicus salinity → JSON (D1-import)
  requirements-env-import.txt  Python deps for Copernicus bridge
EXPANSION_REGISTER.md  Canonical plan — **D4 next**
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

**MCP migrations applied:** `s0_config` … `a3_comms_graph`, `c1_volume_patrol`, `c2_directional_sensors`, `d3_threats`

- **17/17** tables reachable via REST
- RLS enabled; anon read; service role writes
- Demo seed: **offshore pipeline scenario** — 4 assets, 2 missions, pipeline AREA patrol ([SCENARIO_OFFSHORE.md](SCENARIO_OFFSHORE.md))

```bash
pnpm db:verify    # REST — expect 17/17 tables
pnpm verify       # lint + build + ~213 tests
```

### Environmental data (D1)

```bash
# Fetch Open-Meteo + Copernicus → environment_samples (requires SUPABASE_* in .env)
node apps/orchestrator/dist/cli.js env-fetch 0
node apps/orchestrator/dist/cli.js env-fetch --all-ticks

# Copernicus needs: pip install -r scripts/requirements-env-import.txt
# Live API tests: RUN_LIVE_ENV_TESTS=1 pnpm --filter @mission-orchestrator/env-import test
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

### Operator console (primary demo)

```bash
pnpm --filter @mission-orchestrator/ui dev   # → http://localhost:5173
```

The dev server builds the orchestrator and mounts `/api/*` via `orchestrator-api-plugin.ts` — no separate API process.

**Console layout:** fleet rail (left) · plan view + water-column profile (center) · alerts + recommendations (right) · scenario timeline (footer).

Use **Next ▶** or the scrubber to advance ticks 0–8. **Reset** replays from tick 0 and auto-refreshes env data (D1). Tick **4** = UUV comms loss → drift-aware search ellipse, alerts, plan cards. See [SCENARIO_OFFSHORE.md](SCENARIO_OFFSHORE.md).

**Requires:** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in `.env` (Realtime). Tick controls also need `SUPABASE_SERVICE_ROLE_KEY` for the Vite plugin's orchestrator handlers.

---

## Architecture (frozen seams)

```
Open-Meteo / Copernicus ──→ env-fetch ──→ environment_samples
environment_samples ──→ loadEnvironmentContext() ──→ EnvironmentContext
                                                              ├──→ envMult factors (D1)
                                                              └──→ MotionModel.predict drift (D1.2)
Simulator → reports → ingestReports → reconcile() → belief_facts
comms_links ──→ loadCommsModel() ──→ CommsModel (route, linkUtilization, pathDelay)
task_volume_visits ──→ loadVolumeVisits() ──→ EngineInput.volumeVisits
threats / no_go_zones ──→ loadRoutePlanner() ──→ EngineInput.routePlanner
                                                              ↓
assignments + missionDefs + belief + commsModel + motionModel + environmentContext + routePlanner
                              ↓
                    computeTaskLeaf → recomputeMissionStatesWithVisits (PURE)
                              ↓
              Monitor → summarize() → salience gate → Planner.replan()
                    (patrol: handles + planningOverrides in sandbox only;
                     exposure/risk via routePlanner.measure — D3)
                              ↓
              applyPlan (gates: capacity, comms, pointing, no-go) → assignments
                                                              ↓
apps/ui/  ← Supabase Realtime + /api/tick/* + /api/apply-plan (operator console)
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
| `pnpm db:verify` | 17/17 tables, anon RLS OK |
| `pnpm verify` | ~212 passed, 1 todo (Kalman-readiness) |
| Live env tests | `RUN_LIVE_ENV_TESTS=1` — Open-Meteo + Copernicus + DB round-trip green |
| D1 env-fetch | ~200 rows/tick upserted (150 Open-Meteo + 50 Copernicus) |
| Engine purity lint | Passed |
| Rollup leaf-agnostic lint | Passed |
| Planner opaque-handle lint | Passed |
| Supabase comms integration | Live tests passed |
| D3 routePlanner tests | `routePlanner.test.ts` — geometry, no-go gate, planner pruning green |

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
19. **Operator console (UI-1)** — design bindings documented in [`example_operator_console_design.html`](example_operator_console_design.html); coverage and confidence are **separate** in header pills (P6).
20. **UI tick controls** — use `pnpm --filter @mission-orchestrator/ui dev`, not bare `vite` before first orchestrator build.
21. **D1 import boundary** — APIs write `environment_samples` only; engine reads via `EnvironmentContext` (never fetch inside `packages/engine`).
22. **D1 factors no-op without env** — `DEFAULT_ENV_FACTORS` matches motion-only when `environmentContext` absent (B2 guard).
23. **Copernicus salinity** — Python bridge `scripts/copernicus-env-subset.py`; TypeScript orchestrates, NetCDF parsed in Python.
24. **Search ellipse drift (D1.2)** — lost-contact ellipse **center** shifts with current/wind via `environmentDriftMs`; uncertainty still from propagated Q.
25. **Route exposure (D3)** — straight-line segments belief → task target; no-go is a **hard gate** (P5); threats are graded exposure/risk in objective only.
26. **Threat discs v1** — horizontal km geometry with optional z band; polygon threats deferred to D6/C1-future body swap.

---

## Known gaps (non-blocking)

1. **Phase D (remaining)** — D4–D5 spoofing/LLM, D6 Kalman/MIP/scan-time
2. **D1-future** — Sentinel Hub EO proxy · grid interpolation beyond nearest-neighbor
3. **C1-future** — polygon footprint · thermocline z band · multi-leg patrol · per-cell `dwell_s`
4. **Alert demo tuning** — salience ≥ 0.4 with default seed (offshore tick 4 usually fires)
5. **UI contacts rail** — `tracks` table wired when external contacts exist in scenario
6. **UI operating-point buttons** — drawer shows current op; manual `set_operating_point` not exposed in UI yet
7. **Sim idempotency** — upsert or `--force`

---

## Key files for Phase D

| File | Purpose |
|------|---------|
| **[EXPANSION_REGISTER.md](EXPANSION_REGISTER.md)** | **Primary pickup** — Phase D scope, tier reference |
| `packages/env-import/` | **D1-import** — Open-Meteo, Copernicus, validation |
| `packages/engine/src/envFactors/` | D1 factor bodies + `curves.ts` |
| `packages/engine/src/motionModel.ts` | D1.2 — `environmentDriftMs`, current/wind drift |
| `packages/engine/src/environmentContext.ts` | `FieldKind` registry, nearest-neighbor sample |
| `packages/db/environment.ts` | `loadEnvironmentContext`, `upsertEnvironmentSamples` |
| `apps/orchestrator/src/env-fetch.ts` | CLI + scenario wiring |
| `scripts/copernicus-env-subset.py` | Copernicus salinity NetCDF → JSON |
| `packages/engine/src/commsModel.ts` | Comms graph — `buildCommsModel`, `pathDelay` (A3 + D2) |
| `packages/engine/src/ingest.ts` | D2 — delivery ts + hold until `now` |
| `packages/engine/src/routePlanner.ts` | **D3** — exposure/risk measure + no-go gate |
| `packages/db/threats.ts` | D3 — `loadRoutePlanner` |
| `packages/engine/src/reconcile.ts` | D4 — spoofing body |
| `packages/engine/src/summarize.ts` | D5 — LLM body |
| `packages/engine/src/volume/footprint.ts` | D6/C1-future — polygon discretizer body swap |
