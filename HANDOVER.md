# Mission Orchestrator — Handover

**Date:** June 2026  
**Status:** S0–S10 · **A0** · **A1** (incl. A1-revise 3D) · **A2** complete · remote Supabase live (**12 tables**)

**New agent:** Read this file first, then [EXPANSION_REGISTER.md](EXPANSION_REGISTER.md) § **A3**. Original build spec: [README.md](README.md).

---

## Agent pickup (start here)

### What to do next — Phase A3 (Comms graph)

1. Read EXPANSION_REGISTER **A3** — target `CommsModel` graph shape (`route`, `linkUtilization`, `pathDelay`).
2. **Tests first** — two-hop delay sum; shared relay link utilization; gate rejects over-budget link.
3. Create `comms_links` (+ optional `comms_nodes`) migration; apply via **Supabase MCP `apply_migration`** (not REST).
4. Extend `packages/engine/src/commsModel.ts` — keep `fleetUsage` stub for backward compat.
5. Wire `packages/db/src/comms.ts` loader; pass graph body into `buildEngineInputFromDb`.
6. Run `pnpm verify` + `pnpm db:verify` (expect **12/12** tables → **14/14** after A3 if both tables added).
7. **Stop** after A3 green; do not start Phase B until A4 is also done.

### Do not skip

- **A3 → A4 → Phase B** before Tier 3 bodies (volume patrol, directional sensors).
- **Engine purity** — no DB imports inside `packages/engine`.
- **Gate before grade** (P5) — hard cutoffs prune before scoring.
- **One step at a time** — green suite between steps.

### Quick health check

```bash
pnpm db:verify && pnpm verify && node apps/orchestrator/dist/cli.js inspect
```

Expected: **12/12** tables · **~142** tests passed (1 Kalman `test.todo`) · fleet/mission output.

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
| **A0.7** | `commsModel.ts` | Fleet comms gate (D2) — **stub**; A3 adds graph |
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
| `effectiveQuality` | Plumbs `environmentContext` into `envMult` ctx (factors still motion-only until A4) |
| `packages/db/environment.ts` | `loadEnvironmentContext()` from `environment_samples` |
| Supabase | `environment_samples` table (applied via MCP `a2_environment_samples`) |

---

## Not started (ordered)

| Phase | Scope |
|-------|--------|
| **A3** | Comms graph — `route`, `linkUtilization`, `comms_links` / `comms_nodes` |
| **A4** | EnvMult factor registry — stub salinity / sea-state / fog factors |
| **B** | Tier 3 guard tests (rollup leaf-agnostic) |
| **C** | Volume patrol (C1), directional sensors (C2) |
| **D** | Imported data bodies, S11–S13 (threats, spoofing, LLM) |

---

## Repository layout

```
packages/engine/     Pure logic — zero DB deps, Vitest property tests
  spatial.ts         Position3, z-up, slant range (A1)
  estimate.ts        cv6 Estimate, migrateEstimate (A1)
  motionModel.ts     ConstantVelocityModel, propagateState (A2)
  environmentContext.ts  FieldKind, sample(), static/grid bodies (A2)
  coverage.ts        slantRangeKm, effectiveQuality + env ctx (A1/A2)
  searchRegion.ts    ownAssetSearchUncertainty via MotionModel (A1/A2)
  commsModel.ts      Comms stub — extend graph in A3
  …                  reconcile, envMult, objective, planner, summarize, operatingPoint
packages/db/         Supabase loaders
  missions.ts        buildEngineInputFromDb (belief, missions, env ctx, …)
  environment.ts     loadEnvironmentContext (A2)
  tracks.ts          parseTrackRow + migrateEstimate (A1)
apps/orchestrator/   CLI: inspect | sim | tick | apply
apps/ui/             Vite + React Realtime dashboard
supabase/migrations/ S0–A2 DDL (local source of truth; apply remote via MCP)
scripts/             lint-engine.mjs, verify-supabase.mjs, load-env.mjs
EXPANSION_REGISTER.md  Canonical plan — **A3 next**
A1_REVISE_3D.md      A1 3D spec (complete — reference only)
```

---

## Remote Supabase

**Project:** `wyeryyczsdezyvrsqxep` (must match `.env` **and** Cursor Supabase MCP)

| Channel | Use for |
|---------|---------|
| **Supabase MCP** | DDL — `apply_migration`, `list_tables`, `list_migrations` |
| **`.env` REST keys** | Runtime — orchestrator, UI, `pnpm db:verify` |

**MCP migrations applied:** `s0_config` … `a1_tracks`, `a2_environment_samples`

- **12/12** tables reachable via REST
- RLS enabled; anon read; service role writes
- Demo seed: 2 assets, 2 missions, 2 assignments, 13 config keys; `environment_samples` empty (defaults via `staticEnvironmentContext`)

```bash
pnpm db:verify    # REST — expect 12/12 tables
pnpm verify       # lint + build + ~142 tests
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
                                                              ↓
assignments + missionDefs + belief + commsModel + motionModel + environmentContext
                              ↓
                    recomputeMissionStates (PURE)
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
| `pnpm db:verify` | 12/12 tables, anon RLS OK |
| `pnpm verify` | 142 passed, 1 todo (Kalman-readiness) |
| Engine purity lint | Passed |

**Demo note:** Default seed may keep salience below σ=0.4 — tune seed or timeline for alert→plan demo.

---

## Learnings (read before coding)

1. **Supabase MCP vs `.env`** — MCP for DDL; REST for runtime. Re-link MCP if project ref drifts from `SUPABASE_URL`.
2. **`freshness(H) = 0.5`** — implemented as `0.5^(Δt/H)`, not `exp(−Δt/H)`.
3. **Engine purity lint** (`scripts/lint-engine.mjs`) — do not remove.
4. **Root script is `verify`**, not `ci` (pnpm reserves `ci`).
5. **Sim re-runs** — `world_truth` PK duplicates; needs upsert/`--force` (known gap).
6. **A0.3 ≠ confidence** — aggregator is sensor-axis coverage; confidence is min freshness.
7. **Comms is a graph (W5)** — do not hack relay logic into planner or scalar `fleetUsage` alone.
8. **3D spatial (A1)** — `Position3` + z-up; **`z_m = -depth_m` only in `spatial.ts`**.
9. **Operating points opaque to planner** — resolved only in `resolveOperatingPoint`.
10. **One step at a time** — tests first, green suite, stop between steps.

---

## Known gaps (non-blocking)

1. **A3–A4** — remaining Phase A shapes (see EXPANSION_REGISTER)
2. **Alert demo tuning** — salience ≥ 0.4 with default seed
3. **UI Accept** — wire to orchestrator API / Edge Function
4. **Sim idempotency** — upsert or `--force`
5. **UAV seed scenario** — `z_m` belief fact for air-domain demo

---

## Key files for A3

| File | Purpose |
|------|---------|
| **`EXPANSION_REGISTER.md` § A3** | Target CommsModel graph shape + tests |
| `packages/engine/src/commsModel.ts` | Extend interface — keep call sites frozen |
| `packages/engine/src/stateEngine.ts` | `checkFleetCommsGate` — evolve to per-link utilization |
| `packages/db/src/missions.ts` | `buildEngineInputFromDb` — add comms loader |
| `packages/engine/src/applyPlan.ts` | `buildEngineInput` defaults |
| `scripts/lint-engine.mjs` | Purity guardrail |
