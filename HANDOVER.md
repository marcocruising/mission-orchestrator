# Mission Orchestrator — Handover

**Date:** June 2026  
**Status:** S0–S10 complete · **Phase A0 complete** · A1–D pending · remote Supabase live

This document summarizes what was built, how to run it, and lessons learned. The original build spec is
[README.md](README.md). The active expansion plan is [EXPANSION_REGISTER.md](EXPANSION_REGISTER.md).

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

### Structural expansion — Phase A0 (seam retrofits)

| Step | Module | What it enables |
|------|--------|-----------------|
| **A0.1** | `reconcile.ts` | Spoofing / conflicting reports (D4) — body swap on ingest merge |
| **A0.2** | `envMult.ts` | Salinity, sea-state, fog factors (D1) — product over factor list |
| **A0.3** | `coverage.ts` | Substitutable sensors (D6) — injectable axis aggregator |
| **A0.4** | `objective.ts` | Threats/risk terms, fuel/comms costs (D3/D6) — additive `ObjectiveTerm[]` |
| **A0.5** | `planner.ts` | MIP / column-generation solver (D6) — `Planner.replan()` interface |
| **A0.6** | `summarize.ts` | LLM narration (D5) — swappable `Summarizer` |
| **A0.7** | `commsModel.ts` | Fleet comms gate (D2) — `CommsModel` stub; gate uses `fleetUsage` |
| **A0.8** | `operatingPoint.ts` | Directional sensors (C2) — opaque `resolveOperatingPoint` |

### Not started

| Track | Scope |
|-------|--------|
| **A1–A4** | Estimation shapes, motion/env DB, comms graph DB, env factor registry |
| **B** | Tier 3 guard tests (rollup leaf-agnostic) |
| **C** | Area patrol, directional sensor bodies |
| **D** | Imported data, S11–S13, smart bodies behind seams |
| **S11–S13** | Threats/risk, spoofing body, LLM narration body (mapped to D3–D5) |

---

## Repository layout

```
packages/engine/     Pure logic — zero DB deps, Vitest property tests
  reconcile.ts       Ingest merge seam (A0.1)
  envMult.ts         Extensible environment factors (A0.2)
  objective.ts       Extensible plan scoring terms (A0.4)
  commsModel.ts      Comms stub — gate wired (A0.7)
  operatingPoint.ts  Opaque operating-point resolver (A0.8)
  summarize.ts       Alert narration seam (A0.6)
packages/db/         Supabase client, belief/mission loaders, engine input adapter
apps/orchestrator/   CLI: inspect | sim | tick | apply
apps/ui/             Vite + React Realtime dashboard
supabase/
  migrations/        S0–S8 DDL (RLS enabled on all tables)
  seed.sql           Demo fleet, missions, config tunables
  bootstrap.sql      Combined schema+seed for SQL Editor (idempotent)
scripts/
  lint-engine.mjs    CI guardrail — fails if engine imports DB or world_truth
  verify-supabase.mjs  Checks 10 tables + anon RLS via .env keys
  setup-db.mjs       Applies migrations via DATABASE_URL (optional)
EXPANSION_REGISTER.md  Canonical expansion plan (phases A–D)
```

---

## Remote Supabase

**Project:** `wyeryyczsdezyvrsqxep` (matches `.env` and Cursor Supabase MCP after re-link)

- 10/10 tables reachable via REST
- RLS enabled; anon can read; service role writes
- Demo seed: 2 assets, 2 missions, 2 assignments, 13 config keys

```bash
pnpm db:verify    # REST check — no DATABASE_URL needed
pnpm db:setup     # Applies migrations via DATABASE_URL (optional path)
```

---

## How to run

### Prerequisites

- Node 22+, pnpm 9+
- `.env` with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `VITE_*` copies (see `.env.example`)

### One-time

```bash
pnpm install
pnpm build
pnpm db:verify      # expect 10/10 tables
```

### Automated tests

```bash
pnpm verify         # guardrail + build + 92 tests (87 engine)
```

### Terminal demo (main loop)

```bash
node apps/orchestrator/dist/cli.js sim 0    # ingest sim reports
node apps/orchestrator/dist/cli.js tick 0   # recompute state, monitor, plan
node apps/orchestrator/dist/cli.js inspect  # print fleet + mission tiers

node apps/orchestrator/dist/cli.js sim 1 && node apps/orchestrator/dist/cli.js tick 1

# Comms-cut scenario (tick 2 timeline drops uuv-alpha reports)
node apps/orchestrator/dist/cli.js sim 2 && node apps/orchestrator/dist/cli.js tick 2
```

### UI

```bash
pnpm --filter @mission-orchestrator/ui dev
# → http://localhost:5173
```

### Offline (no Supabase)

```bash
SUPABASE_URL= node apps/orchestrator/dist/cli.js inspect 1
```

---

## Architecture (frozen seams)

```
Simulator → reports → ingestReports → reconcile() → belief_facts
                                              ↓
assignments + missionDefs + belief + commsModel + resolveOperatingPoint
                              ↓
                    recomputeMissionStates (PURE)
                              ↓
              Monitor → summarize() → salience gate → Planner.replan()
                              ↓
              applyPlan (re-validate gates incl. CommsModel) → assignments
```

**Invariants enforced:**

1. Engine reads `belief`, never `world_truth` (CI lint)
2. State engine is pure — `(belief, assignments, missionDefs, now)` + injected models
3. Capability is a sensor vector, not a scalar
4. Do-nothing plan always evaluated
5. All assignment changes via `applyPlan`
6. Coverage and confidence never multiplied
7. New fields additive only (migration discipline)

---

## Test run results (last session)

| Check | Result |
|-------|--------|
| `pnpm db:verify` | 10/10 tables, anon RLS OK |
| `pnpm verify` | 92 tests passed (87 engine) |
| Engine purity lint | Passed |

**Demo note:** With default seed, `mission-track` can sit AT_RISK while salience stays below σ=0.4 — alerts/plans may not fire until seed or timeline is tuned (see learnings below).

---

## Learnings — original build

### 1. Supabase MCP vs `.env` are separate channels

- REST keys authenticate HTTP API; they cannot run DDL.
- Supabase MCP connects to a specific project for migrations; it does not read `.env`.
- **Fix:** Re-link MCP to the same project ref as `SUPABASE_URL`.

### 2. `freshness(H) = 0.5` vs README formula

Implemented as half-life decay `0.5^(Δt / H)`, not `exp(−Δt / H)`.

### 3. Engine purity guardrail is essential

`scripts/lint-engine.mjs` — do not remove. Main enforcement of P1/P2.

### 4. Root script is `verify`, not `ci`

`pnpm ci` is reserved by pnpm.

### 5. Sim re-runs need idempotency

`world_truth` PK `(tick, asset_id)` — re-running `sim 0` throws duplicate key.

### 6. Salience gate tuning matters for demo UX

Tune `W_m`, `window_end_s`, `sigma`, or comms-cut timing to trigger alert→plan→Accept loop.

### 7. `.env` auto-load

Orchestrator CLI imports `scripts/load-env.mjs`. Vite UI reads repo-root `.env`.

### 8. RLS from day one

All tables have RLS; UI uses anon key for read-only Realtime.

---

## Learnings — expansion work (watch-outs)

### 9. The S4 freeze gate was missed — retroactively fixing with Phase A

S4–S10 shipped before estimation, env, and comms **shapes** were installed. Phase A0 retrofits cheap
seams; A1–A4 installs remaining shapes. **Do not skip A1–A4** and jump to imported data or Tier 3 bodies.

### 10. Test behavior, not tautologies

Each A0 step uses golden fixtures, monotonicity checks, and seam-swap tests — not `expect(1).toBe(1)`.
Keep this discipline in A1+.

### 11. A0.3 ≠ confidence aggregation

`coverageTask` aggregator combines **sensor-axis satisfaction** into task coverage. Mission **confidence**
still uses `confidenceMission` (min freshness). Do not conflate them.

### 12. Extensibility pattern: factor lists and term lists

- **Environment → sensors:** `envMult(factors[], ctx)` (A0.2)
- **Plan scoring:** `computeObjective(ctx, terms[])` (A0.4)

Use the same pattern for new graded effects — do not add one-off branches in planner or coverage core.

### 13. Comms: scalar `fleetUsage` is a stub, not the final model

A0.7 wires the gate to `CommsModel`. Real relay topology (asset → relay → sat → shore) needs a **graph**
in **A3**: `route(from, to)`, per-**link** utilization, `pathDelay` summed over hops. **Do not** encode
relay logic in the planner or by hacking `fleetUsage` as a single number — that becomes technical debt.
See EXPANSION_REGISTER A3 for the target shape.

### 14. Operating points must stay opaque to the planner

Planner emits handle strings; only `resolveOperatingPoint` interprets them (enum, numeric, JSON bearing).
Directional sensors (C2) add `bearing_deg` without planner changes.

### 15. UI search ellipse is still ad-hoc

`apps/ui/src/lib.ts` uses `v_max·Δt` directly. A1/T2.4 unifies with `covToEllipse` from `Estimate` —
refactor UI when estimation shapes land; do not add a third uncertainty representation.

### 16. Uncommitted setup scripts (optional commit)

These may still exist untracked: `scripts/load-env.mjs`, `verify-supabase.mjs`, `setup-db.mjs`,
`supabase/bootstrap.sql`, package.json db scripts.

---

## Known gaps / recommended next work

1. **Phase A1** — `Estimate`, `Measurement`, `Estimator`, `Track`, unified `UncertaintyRegion`
2. **Phase A2** — `MotionModel`, `EnvironmentContext`, `environment_samples` table
3. **Phase A3** — Comms **graph** shape (`route`, per-link utilization) + `comms_links` / `comms_nodes` tables
4. **Phase A4** — Full env factor registry (salinity, sea-state, fog stubs)
5. **Phase B** — Rollup-is-leaf-agnostic guard test before area patrol
6. **Trigger alert demo** — tune seed so salience ≥ 0.4 and plans appear in UI
7. **Wire UI Accept** — API route or Edge Function for `applyPlan`
8. **Sim idempotency** — upsert or `--force` for replay
9. **S11–S13 bodies** — D3 threats, D4 spoofing reconcile body, D5 LLM summarize body

---

## Key files for the next developer

| File | Purpose |
|------|---------|
| `EXPANSION_REGISTER.md` | Canonical plan — phases, tiers, watch-outs |
| `packages/engine/src/stateEngine.ts` | MissionState derived pass |
| `packages/engine/src/coverage.ts` | effectiveQuality, coverageTask aggregator |
| `packages/engine/src/objective.ts` | Plan scoring terms |
| `packages/engine/src/planner.ts` | `Planner.replan`, candidate generation |
| `packages/engine/src/commsModel.ts` | Comms stub (extend in A3) |
| `packages/engine/src/operatingPoint.ts` | Opaque operating-point resolver |
| `packages/engine/src/reconcile.ts` | Belief merge seam |
| `packages/engine/src/summarize.ts` | Alert narration seam |
| `apps/orchestrator/src/tick.ts` | Full tick loop |
| `packages/db/src/missions.ts` | DB → EngineInput adapter |
| `scripts/lint-engine.mjs` | Purity guardrail |

---

## Quick health check

```bash
pnpm db:verify && pnpm verify && node apps/orchestrator/dist/cli.js inspect
```

All green + fleet/mission output = healthy.
