# Mission Orchestrator — Handover

**Date:** June 2026  
**Status:** S0–S10 implemented · S11–S13 not started · remote Supabase live

This document summarizes what was built, how to run it, and lessons learned. The original build spec remains in [README.md](README.md).

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

### Steps completed (S0–S10)

| Step | Deliverable | Status |
|------|-------------|--------|
| **S0** | pnpm monorepo, Supabase migrations scaffold, CI engine-purity guardrail, `.env.example` | Done |
| **S1** | Pure types, `Fact`/`Belief`, half-life `freshness` | Done |
| **S2** | World/belief schema, `Simulator`, `ingestReports`, `inspect` CLI | Done |
| **S3** | Coverage engine + property tests (gate-before-grade, min/weighted-avg, P6) | Done |
| **S4** | Missions/assignments schema, DB→engine adapter | Done |
| **S5** | Full `MissionState` + persistence, sticky `cov_baseline` | Done |
| **S6** | `Monitor.scan`, salience gate, template alert summaries | Done |
| **S7** | Planner: sandbox re-eval, do-nothing baseline, `Obj` ranking | Done |
| **S8** | `applyPlan` re-validation, `decision_log`, tick loop CLI | Done |
| **S9** | React UI: map, search ellipses, mission tiles, recommendation panel | Done |
| **S10** | Operating-point candidates (`STATION`/`SLOW`/`FAST`) | Done |

### Steps not started (stretch)

| Step | Scope |
|------|--------|
| **S11** | Threats, no-go zones, non-zero `exposure`/`risk` |
| **S12** | Scale (20 assets), spoofing / conflicting reports |
| **S13** | Real LLM narration (replaces template `summary_text`) |

### Git history

```
45ec509  S0: scaffold + local Supabase + CI guardrail
7255ed0  S1: pure core types, Fact model, and freshness
5fa3533  S2-S10: coverage engine, tick loop, planner, UI
```

### Uncommitted local changes (post-S10)

These files exist in the working tree but were not committed:

- `scripts/load-env.mjs`, `scripts/verify-supabase.mjs`, `scripts/setup-db.mjs`
- `supabase/bootstrap.sql` (one-shot SQL for dashboard / non-MCP setup)
- Updates to `package.json` (`db:verify`, `db:setup`), `.env.example`, `apps/orchestrator/src/cli.ts` (auto `.env` load)

Recommend committing these before the next session.

---

## Repository layout

```
packages/engine/     Pure logic — zero DB deps, Vitest property tests
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
```

---

## Remote Supabase

**Project:** `wyeryyczsdezyvrsqxep` (matches `.env` and Cursor Supabase MCP after re-link)

Schema was applied via MCP `apply_migration` + `execute_sql` seed. Verified:

- 10/10 tables reachable via REST
- RLS enabled; anon can read; service role writes
- Demo seed: 2 assets, 2 missions, 2 assignments, 13 config keys

### Scripts

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
pnpm verify         # guardrail + build + 38 Vitest tests
```

### Terminal demo (main loop)

```bash
node apps/orchestrator/dist/cli.js sim 0    # ingest sim reports
node apps/orchestrator/dist/cli.js tick 0   # recompute state, monitor, plan
node apps/orchestrator/dist/cli.js inspect  # print fleet + mission tiers

# Advance
node apps/orchestrator/dist/cli.js sim 1 && node apps/orchestrator/dist/cli.js tick 1

# Comms-cut scenario (tick 2 timeline drops uuv-alpha reports)
node apps/orchestrator/dist/cli.js sim 2 && node apps/orchestrator/dist/cli.js tick 2
```

### UI

```bash
pnpm --filter @mission-orchestrator/ui dev
# → http://localhost:5173
```

Run `sim` / `tick` in another terminal; Realtime subscriptions refresh belief, mission_state, plan_eval.

### Offline (no Supabase)

```bash
SUPABASE_URL= node apps/orchestrator/dist/cli.js inspect 1
```

Runs pure engine + local simulator only.

---

## Architecture (frozen seams)

```
Simulator → reports → ingestReports → belief_facts
                                              ↓
assignments + missionDefs + belief ──→ recomputeMissionStates (PURE)
                                              ↓
                                    Monitor → salience gate → Planner
                                              ↓
                                    applyPlan (re-validate) → assignments
```

**Invariants enforced:**

1. Engine reads `belief`, never `world_truth` (CI lint)
2. State engine is pure — `(belief, assignments, missionDefs, now)`
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
| `pnpm verify` | 38 tests passed |
| Tick loop 0–2 | mission_state rows persisted |
| Sim tick 2 | 9 reports (uuv-alpha comms cut — belief frozen) |
| UI dev server | HTTP 200 at localhost:5173 |

**Observed live state after tick 2:**

- `mission-track`: AT_RISK, ~34% coverage
- `mission-patrol`: FULL, 100% coverage
- Belief frozen for `uuv-alpha` when comms dropped (by design)

**Alerts/plans:** No rows in `alert_log` / `plan_eval` yet — salience stayed 0.00 because `impact × urgency × confidence` did not cross σ=0.4 with the current demo timeline and sticky baselines. Monitor and planner code paths exist; the demo scenario needs a sharper disruption (or lower σ / higher priority) to trigger the full alert→plan→Accept loop in practice.

---

## Learnings

### 1. Supabase MCP vs `.env` are separate channels

- **REST keys** (anon / service role in `.env`) authenticate the HTTP API. They work for CRUD but **cannot run DDL**.
- **Supabase MCP** (Cursor settings) connects to a specific project for `apply_migration` / `execute_sql`. It does **not** read `.env`.
- Early session failure: MCP pointed at `ntehtwatfmrhrcmoxevm` while `.env` pointed at `wyeryyczsdezyvrsqxep`. Symptom: keys “work” but MCP migrations go to the wrong DB, or MCP times out on a paused project.
- **Fix:** Re-link MCP to the same project ref as `SUPABASE_URL`. Confirm with MCP `get_project_url`.

### 2. `freshness(H) = 0.5` vs README formula

README writes `freshness(Δt) = exp(−Δt / H)` but S1 done-when requires `freshness(H) = 0.5`. Implemented as **half-life decay**: `0.5^(Δt / H)`. Document this if aligning with the README formula literally.

### 3. Engine purity guardrail is essential

`scripts/lint-engine.mjs` fails CI if `packages/engine` imports Supabase, `@mission-orchestrator/db`, or references `world_truth`. This is the main enforcement of P1/P2 — don’t remove it.

### 4. `pnpm ci` is reserved by pnpm

Root script is named `verify`, not `ci`.

### 5. Sim re-runs need idempotency or cleanup

`world_truth` has PK `(tick, asset_id)`. Re-running `sim 0` on the same DB throws duplicate key. Options for next iteration:

- Upsert in sim writer, or
- `sim --force` that deletes tick rows first, or
- Document “reset DB before replay”

### 6. Salience gate tuning matters for demo UX

With default seed, track mission sits at AT_RISK but salience stays 0 — urgency may clamp to 0 when `time_to_act` exceeds `T_ref`, or impact is modest vs baseline. To demo alerts/plans/UI Accept flow reliably, consider:

- Cutter comms earlier with higher `W_m` and lower `cov_baseline`
- Shorter `window_end_s` to raise urgency
- Temporarily lower `sigma` in config seed

### 7. `.env` auto-load

Orchestrator CLI imports `scripts/load-env.mjs` so commands work without `source .env`. Vite UI reads `VITE_SUPABASE_*` from repo-root `.env` via `envDir: "../../"`.

### 8. RLS from day one

All tables have RLS + `service_role` all-access + `anon`/`authenticated` select policies. UI uses anon key safely for read-only Realtime.

---

## Known gaps / recommended next work

1. **Commit** uncommitted setup scripts and bootstrap SQL.
2. **Trigger alert demo** — tune seed or tick 2 timeline so salience ≥ 0.4 and plans appear in UI.
3. **Wire UI Accept** — currently alerts to run `orchestrator apply <planId>`; add API route or Supabase Edge Function.
4. **Enable Realtime** on tables in Supabase dashboard if subscriptions are silent (Publication settings).
5. **Sim idempotency** — handle duplicate tick inserts.
6. **S11–S13** per [README.md](README.md) stretch ladder.
7. **`DATABASE_URL`** in `.env` optional — enables `pnpm db:setup` without MCP.

---

## Key files for the next developer

| File | Purpose |
|------|---------|
| `packages/engine/src/stateEngine.ts` | THE derived pass — MissionState |
| `packages/engine/src/coverage.ts` | effectiveQuality, satisfaction, tier |
| `packages/engine/src/planner.ts` | generateCandidates, sandbox eval |
| `packages/engine/src/applyPlan.ts` | Commit + re-validation |
| `apps/orchestrator/src/tick.ts` | Full tick loop (ingest → state → monitor → plan) |
| `apps/orchestrator/src/cli.ts` | CLI entry |
| `packages/db/src/missions.ts` | DB → EngineInput adapter |
| `apps/ui/src/App.tsx` | Realtime dashboard |
| `supabase/migrations/*.sql` | Schema contract |
| `scripts/lint-engine.mjs` | Purity guardrail |

---

## Quick health check

```bash
pnpm db:verify && pnpm verify && node apps/orchestrator/dist/cli.js inspect
```

All green + fleet/mission output = handover state is healthy.
