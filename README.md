# Mission Orchestrator — Build README (for Claude Code)

> **Project status (June 2026):** Original build ladder **S0–S10 is complete**. Structural expansion
> **Phase A0–A4** and **Phase B** complete. **Phase C complete** (C1a volume patrol, C1b planner sweep, C2 directional sensors).
> **UI-1 complete** — operator console frontend ([`example_operator_console_design.html`](example_operator_console_design.html) → `apps/ui/`).
> **D2 complete** — comms graph in seed, `ingestReports` pathDelay + delivery hold.
> **Active work: Phase D3+** — threats, spoofing, LLM. Runbook: [HANDOVER.md](HANDOVER.md) · [EXPANSION_REGISTER.md](EXPANSION_REGISTER.md) · demo: [SCENARIO_OFFSHORE.md](SCENARIO_OFFSHORE.md).

You are building **Mission Orchestrator**: single-operator decision support for a fleet of unmanned
naval vehicles. When a vehicle fails or degrades, the system recomputes how every mission is affected
and recommends the least-bad reassignment — the operator decides, the system commits. This README is
the build spec; it defines the **logic, columns, formulas, and seams**. (Specific seed values are
illustrative and tunable — get the *column definitions and order of operations* right; the numbers are
demo knobs.)

---

## ⛔ PRIME DIRECTIVE — how you must work

**Build iteratively, one step at a time. Never one-shot this project.** For EVERY step:

1. Read the step's goal, build list, and tests. If anything is ambiguous, stop and ask.
2. **Write the tests first** and confirm they FAIL for the right reason.
3. Implement the minimum to make that step's tests pass — nothing from a later step.
4. Run the full suite. Do **not** proceed while anything is red.
5. **Commit** with the step id.
6. **STOP, summarize, show green output, and wait for confirmation** before the next step. Don't batch
   steps, don't skip the gate, don't reshape a frozen interface to make a later step easier.

If a test can't pass, **stop and report the blocker** — don't hack around the architecture.

---

## Design principles baked in (the lessons — these govern every step)

- **P1 — Contracts freeze, bodies expand.** Build the simplest body that passes the test. Every future
  complexity has a *named seam* it enters through (see **Deferred register**). Never reshape a frozen
  interface; only swap a body behind it.
- **P2 — The coverage/state engine is a PURE function** of `(belief, assignments, missionDefs, now)`.
  Load-bearing: the planner simulates futures by calling the *same* function on hypothetical inputs.
  No DB reads, no `Date.now()`, no mutation inside it — `now` is always a parameter.
- **P3 — `MissionState` is the ONE derived object.** *Everything* numeric about a mission (coverage,
  confidence, impact, urgency, salience) is computed in one pure pass and written to one row. The alert
  step and the planning step are **readers** of `MissionState`; they never recompute mission numbers.
  (This replaces the earlier mistake of splitting per-mission numbers across steps.)
- **P4 — Capability is a vector over sensors, never a "busy %" scalar.** Supply (`capacity`) and demand
  live on the same axes so they can be compared.
- **P5 — Gate, then grade.** Hard cutoffs (range / depth / domain / capacity) **prune** infeasible
  options *before* any scoring; graded quality only ranks the survivors. Graded quality must be
  **monotonic** (closer = better, slower = better for listening). Ordinal correctness matters; physical
  precision does not.
- **P6 — Coverage and confidence are two numbers, never multiplied.** "60% covered, 30% sure" is a
  different situation from "60% covered, certain." Carry them side by side to the top.
- **P7 — `min` within a task, weighted-average across a mission.** A task needs *all* its sensors
  (weakest caps it → `min`); a mission tolerates a weak minor task (→ priority-weighted average). Keep
  this asymmetry straight — reversing it breaks the system.
- **P8 — The LLM narrates; the deterministic core computes and decides.** The LLM only writes the human
  sentence from an already-computed `MissionState` row. It never produces a number or a decision.
- **P9 — The do-nothing plan is always evaluated and can win.** It's the anti-thrash baseline; score it
  honestly (including likely asset recovery) so the fleet isn't reshuffled over a 10-second blip.
- **P10 — The objective ranks, it doesn't reveal truth.** Its weights glue incommensurable units; they
  give correct *ordering*, tuned not derived. That's why the operator commits and why close calls are a
  feature, not a bug.

### Invariants (CI enforces #1, #2, #6)
1. Engines read `belief`, never `world_truth`. 2. The state engine is pure (P2). 3. Capability is a
vector (P4). 4. A Plan is a set of moves (`reassign`, `set_operating_point`); do-nothing always
evaluated. 5. All assignment changes go through `applyPlan`, which re-validates against current belief.
6. Coverage and confidence never multiplied. 7. New columns/fields are additive only.

---

## Stack (decided — do not deliberate)

TypeScript everywhere · pnpm monorepo: `packages/engine` (pure, zero deps), `packages/db` (Supabase
client + typed queries), `apps/orchestrator` (tick loop), `apps/ui` (operator console) · **Supabase** (Postgres),
local via `supabase start`; schema in `supabase/migrations/*.sql`, seeded by `supabase/seed.sql` ·
**Vitest** (engine tests pure, no DB; integration tests vs local Supabase) · UI: Supabase Realtime + dev orchestrator API (Vite plugin).

Create tables **incrementally** — each step's migration adds only what it needs.

---

## Conventions & decisions (pinned — so you don't invent these)

- **Coordinate plane:** flat local grid. **Horizontal:** `x_km`, `y_km` (km) at DB/UI boundary.
  **Vertical (engine):** signed **`z_m` (meters), z-up** — sea surface = 0; altitude **> 0**; depth **< 0**
  (deeper = more negative). Inside `packages/engine`, use **`Position3 { x_m, y_m, z_m }`** (all meters).
  Legacy Postgres **`depth_m`** (positive below surface) converts **`z_m = -depth_m`** in `spatial.ts` only.
  Air assets use a **`z_m` belief fact** (positive). See [A1_REVISE_3D.md](A1_REVISE_3D.md).
  If you store lat/lon, convert to the km grid **once at ingest**; do not use geodesics in-engine.
  Units: **km** (horizontal display), **m** (vertical), **knots**, **seconds**.
- **Clock / tick:** the orchestrator owns the single `now`. One tick = `ingest reports → recompute
  MissionState → monitor → (if a disruption passes the salience gate) plan`. Cadence configurable
  (e.g. 1 s). `now` is passed into the engine, never read inside it (P2).
- **`time_to_act`:** `min over the affected mission's tasks of (task.window_end_s − now)`; if a task has
  no window, use the at-risk asset's **battery-time-remaining**; floor at a small ε. Drives `urgency`.
- **`exposure`, `risk` in the objective = 0 until S11.** Threats/no-go zones don't exist before then.
  Keep the terms in the formula (frozen shape) with value 0.
- **`operating_point`:** an **opaque handle** resolved only by `CapacityModel`. Fixture set:
  `{STATION, SLOW, FAST}` (or a raw speed). The planner compares the **resolved capacity vectors**,
  never handle names — so different vehicle types may have different handle sets (P4/P5).
- **`last_contact_ts`:** store per asset (the ts of its newest belief fact). Search-ellipse semi-major
  `= v_max · (now − last_contact_ts)`.
- **Disruption → replan wiring:** when `Monitor` writes an alert that clears the salience gate, the
  orchestrator calls the planner for the affected mission(s); concurrent disruptions are planned as one set.
- **`cov_baseline`:** sticky. Set when an assignment is (re)issued or the operator acknowledges; never
  recomputed per tick. It's the reference that makes "hurt" measurable.

---

## Domain model → Supabase tables — **column definitions are the contract** (values illustrative)

Created across steps, not up front. Types are guidance; meaning is the point.

**`assets`** *(static spec)* — `id, kind(UAV|USV|UUV), domain(air|surface|subsurface),
depth_rating_m, top_speed_kn, gps_dependent bool`.
**`asset_sensors`** *(the capability vector, one row per sensor)* — `asset_id, sensor, base_quality
[0–1], max_range_km, k_motion, beam_half_angle_deg nullable` *(omit beam = omnidirectional; C2)*.
*The vector is the set of rows for an asset; never collapse to a scalar.*
**`world_truth`** *(sim-only ground truth, per tick)* — `tick, asset_id, x_km, y_km, depth_m, speed_kn,
heading_deg, battery_pct, health, comms_up bool, gps_ok bool`.
**`reports`** *(simulated received packets; may drop/delay/drift)* — `ts, asset_id, field, value jsonb`.
**`belief_facts`** *(the Fact model — the system's knowledge)* — `asset_id, field, value jsonb, ts,
source(telemetry|sensor|estimate|operator), confidence [0–1], half_life_s`. Keyed `(asset_id, field)`.
*Confidence at time `ts`; `freshness(now)` decays it.*
**`missions`** — `id, name, type, priority W_m [0–1], human_desc`.
**`tasks`** — `id, mission_id, w_t [0–1], target_x, target_y, target_depth_m, window_end_s nullable, kind(POINT|AREA), footprint jsonb, z_min_m, z_max_m, revisit_interval_s, cell_size_m` *(AREA patrol — C1)*.
**`task_demands`** *(the demand bundle — graded amounts only)* — `task_id, sensor, min_quality [0–1]`.
*This holds "how much"; hard requirements go in the next table (P5).*
**`task_volume_visits`** *(C1 patrol memory)* — `task_id, cell_id, last_visit_ts, peak_quality`.
**`task_constraints`** *(hard gates — pass/fail)* — `task_id, kind(depth|domain|los|capacity), param jsonb`.
**`assignments`** *(current who-does-what; what a plan mutates)* — `id, asset_id, task_id,
operating_point, issued_ts`.
**`mission_state`** *(THE derived object, recomputed each tick — P3)* — `mission_id, tick, cov_baseline,
cov_now, tier, confidence, time_to_act_s, impact, urgency, salience`. *Only `cov_baseline` is sticky;
all else is recomputed.*
**`alert_log`** *(append-only)* — `ts, mission_id, salience, tier_change, summary_text, shown bool`.
*Core fills every column except `summary_text`; the LLM writes only that cell (P8).*
**`candidate_plans`** — `plan_id, disruption_id, moves jsonb, n_moves`.
**`plan_eval`** *(the ranked recommendation panel)* — `plan_id, cov_by_mission jsonb, objective,
total_exposure, cascades jsonb, assumptions jsonb`.
**`decision_log`** *(append-only — accountability)* — `ts, disruption_id, plans_shown jsonb,
chosen_plan_id, operator`.
**`config`** *(tunables — seeded)* — `key, value`.

---

## The logic (formulas + the order of operations)

```
freshness(Δt)   = exp(−Δt / H)                                  H = 120 s
q(v,s,t)        = base · rangeMult(R) · envMult(v,s)            ← effective quality of one sensor vs one task
                  rangeMult(R) = (1 − R/Rmax)^p   (p = 0.5)     graded falloff with range
                  R = slantRangeKm(vehicle, target)             ← 3D distance (A1-revise); today 2D hypot (legacy)
                  envMult(v,s) = Π_k m_k(context, sensor)       general multiplier — TODAY = e^(−k_s·speed/vmax)
                  HARD: if R > Rmax → INFEASIBLE  (prune, do NOT score)   ← gate before grade (P5)
sat(t,s)        = min( Σ_v q(v,s,t) / demand(t,s) , 1 )         ← axis satisfaction; Σ_v lets vehicles team up
cov_t           = min over required axes s of sat(t,s)          ← task = weakest sensor (Liebig / bundle)
cov_m           = Σ_t (w_t · cov_t) / Σ_t w_t                   ← mission = priority-weighted tasks (P7)
tier(cov_m)     = FULL ≥.85 · DEGRADED ≥.60 · AT_RISK ≥.30 · LOST
confidence_m    = min freshness of facts feeding cov_m          ← beside coverage, never multiplied (P6)
impact_m        = W_m · (cov_baseline − cov_now)
urgency_m       = clamp(1 − time_to_act/T_ref, 0, 1)            T_ref = 600 s
salience_m      = impact_m · urgency_m · confidence_m           gate: alert if ≥ σ = 0.4
Obj(plan)       = Σ_m W_m·cov_m(plan) − λ_move·moves − λ_exp·exposure − λ_risk·risk
```

**Hard capacity gate (P5, separate from score):** for each vehicle, `Σ_t demand(t,s) ≤ capacity(v,s)`
on every axis → else the plan is infeasible. **Keep one non-binding fleet gate** too
(`Σ comms ≤ BIG`) — it never fires now, but it forces the evaluator to be able to see the whole fleet
at once, which real bandwidth contention will need later. *Collapse the content, keep the shape.*

**`envMult` is a general seam (P1).** Today it has one factor — motion (`e^(−k·speed/vmax)`: motion
ruins sonar, barely dents a camera, so `k` is per-sensor). Salinity, sea-state, fog later are **added
factors** with the same signature `m(context, sensor) → [0,1]`. Frozen seam = the multiplier function;
body = how many factors are in the product.

**Demand bundles (P5):** a `task_demands` row holds a graded "how much" per sensor. "Must dive ≥250 m"
is **not** a demand — it's a `task_constraints` row (a gate). Separating them is what lets the system
say "infeasible" instead of "low score."

**Constants → `config` seed:** `H=120, σ=0.4, T_ref=600, λ_move=0.05, λ_exp=0.3, λ_risk=0.2, p=0.5`;
`k`: passive_acoustic=1.6, eo_ir=0.36, active_sonar=0.29; tiers 0.85/0.60/0.30. *Demo-tuned: correct
ordering, not physics.*

---

## Tests assert the LOGIC, not specific cells

Per the priority: **property-based assertions on the logic** matter more than exact seeded numbers. For
the coverage engine, test that:
- a hard-cutoff failure **prunes** (returns INFEASIBLE), never returns a low score;
- quality is **monotonic** — decrease range or speed → quality rises (P5);
- a two-sensor task is **capped by its weaker axis** (`min`, P7);
- two vehicles on **different axes** of one task **sum** to cover what neither could alone;
- a mission with one failed minor task **degrades, doesn't zero** (weighted average, P7);
- coverage and confidence are **independent** (stale data drops confidence, not coverage, P6);
- **adding a new sensor to the registry needs zero engine changes** (extensibility regression);
- the planner reusing the engine on a sandbox yields the same numbers as the live path.

Keep 2–3 exact numbers as regression anchors if useful, but the properties above are the real spec.

---

## ITERATIVE STEP LADDER

Obey the PRIME DIRECTIVE between every step. Each: **Goal · Build · Test · ✓ Done-when.**

### Phase A — Foundation
**S0 · Scaffold + local Supabase + CI.** Monorepo, Vitest, `supabase init`, `config` migration+seed, and
a **CI lint that fails if `packages/engine` imports the DB client or references `world_truth`.**
✓ CI green on empty skeleton; the guardrail provably catches a deliberate violation.

**S1 · Pure core types + `Fact` + `freshness`** *(pure, no DB).* ✓ `freshness(0)=1`, `freshness(H)=0.5`; types compile; zero DB imports.

### Phase B — A ticking world
**S2 · World/belief schema + sim + ingest.** Migrations (`assets, asset_sensors, world_truth, reports,
belief_facts`); `Simulator` (writes truth+reports on a scripted timeline, with a drop-this-asset toggle);
`ingestReports` (reports → `belief_facts`, last-write-by-ts). ✓ belief ≈ truth while comms up; **shuffled
report order → identical belief**; drop toggle freezes that asset's belief; CLI `inspect` prints the believed fleet.

### Phase C — The coverage engine (the heart)
**S3 · Coverage engine** *(pure).* `effectiveQuality` (with hard cutoff + `rangeMult` + `envMult`),
`satisfaction`, `coverageTask` (min), `coverageMission` (weighted avg), `tier`, `confidenceMission`.
✓ all the **property tests above** pass; extensibility regression passes.

**S4 · Missions/assignments schema + wire to data.** Migrations (`missions, tasks, task_demands,
task_constraints, assignments`); adapter reads them + `belief_facts` into the engine's plain-object input.
✓ `inspect` prints each mission's tier + confidence, recomputed each tick from real data.

### Phase D — Notice and narrate
**S5 · `MissionState` (full) + persistence** *(P3).* Extend the pure engine to also compute
`impact, urgency, salience`; persist the full row to `mission_state`. `cov_baseline` sticky. ✓ dropping a
vehicle on a high-priority task moves `cov_now`/`impact`/`salience`; `cov_baseline` holds until acknowledged.

**S6 · Monitor + salience gate + summary stub.** `Monitor.scan(belief)` raises a `Disruption`
(freshness floor / battery reserve / health change); the gate (`salience ≥ σ`) decides whether to write an
`alert_log` row; `summary_text` is a **template string** for now (LLM is S13). ✓ low-salience blip logged
not shown; high-salience loss shown; Monitor fires with **no scripted inject**.

### Phase E — Plan and commit (closes the loop)
**S7 · Planner** *(reuses the S3 engine on sandboxed inputs).* `generateCandidates` → 1–2 move plans
incl. `set_operating_point`, plus the **do-nothing baseline (P9)**; for each, **clone the input, apply
moves, re-run S3**, compute `Obj` (`exposure=risk=0` for now), fill `plan_eval` with per-mission cov,
cascades, assumptions; rank. ✓ cascades name the degraded secondary mission; a 2-move plan can outrank all
1-move; do-nothing present and can win; deterministic.

**S8 · Apply (commit + re-validate) + decision log.** `applyPlan` re-checks against **current** belief
(it moved since evaluation); commit → write `assignments` + `decision_log`, or reject → re-plan.
✓ a plan gone infeasible between eval and commit is **rejected with a reason**; committed plan updates
`assignments` and recomputes `mission_state`. **Full closed loop in the terminal — the mandatory system.**

### Phase F — Tangible
**S9 · UI over Realtime** *(superseded by **UI-1** operator console, June 2026).* Original: map + search
ellipse + mission tiles + recommendation panel. **UI-1** replaces that scaffold with the full operator
console — dual tactical view (plan + water-column profile), fleet rail, mission health pills (coverage +
confidence separate, P6), alert triage, ranked plan cards, asset drawer (sensor base vs effective),
scenario timeline scrubber. Design spec: [`example_operator_console_design.html`](example_operator_console_design.html).
✓ cut comms → pulsing search ellipse; Accept → `/api/apply-plan`; tick scrubber → `/api/tick/*`.

### Phase G — The trophy
**S10 · Planner explores operating points.** `set_operating_point` varies speed; the `envMult` motion term
(already in S3) means slowing restores acoustic quality. Planner weighs "throttle this vehicle" vs
"reassign another." ✓ when speed is degrading a track, planner ranks **"slow to LISTEN"** above "reassign"
when `Obj` is higher; **S3 engine math unchanged** (only the candidate set grew).

### Phase H — Stretch (only after S10 green)
**S11 · Threats & risk** — add `threats`/`no_go`; `exposure`/`risk` terms become non-zero (routes measure
then avoid). **S12 · Scale + spoofing** — 20 assets, salience keeps interrupts ≤ k; a conflicting report
lowers a Fact's confidence rather than corrupting belief. **S13 · Real LLM narration** — swap the S6
template for an LLM call that narrates the computed `mission_state` row (writes prose, computes nothing — P8).

---

## Deferred register — what's deliberately simple now, and the seam it re-enters through

> **Update (post-A0):** Many seams below are **installed with stub bodies**. Full implementations follow
> [EXPANSION_REGISTER.md](EXPANSION_REGISTER.md) Phases A1–D. Do not reshape frozen interfaces — swap bodies.

| Deferred | Re-enters via | When | Seam status |
|---|---|---|---|
| Threat-avoiding routing; `exposure`/`risk` > 0 | `RoutePlanner` body + `ObjectiveTerm[]` (A0.4) | S11 / D3 | ✅ terms wired (=0) |
| Spoofing / adversarial data | `reconcile()` body (A0.1) | S12 / D4 | ✅ seam installed |
| LLM summaries | `summarize()` body (A0.6) | S13 / D5 | ✅ seam installed |
| Salinity / sea-state / fog | `envMult` factor list (A0.2 + **A4 ✅**) | D1 | ✅ **bodies live** (import via `env-fetch`) |
| Wind / current drift | `MotionModel.environmentDriftMs` (A2 + D1.2) | D1 | ✅ currents + surface windage |
| Comms multi-hop delay | `ingestReports` + `CommsModel.pathDelay` (A3 + D2) | D2 | ✅ delivery ts + hold until `now` |
| Dynamics-aware staleness | `Fact.half_life` → `MotionModel` body (A2) | D6 | ✅ shape installed |
| Continuous operating points | `resolveOperatingPoint` (A0.8) | D6 | ✅ seam installed |
| Area / sector-blanketing coverage | `computeTaskLeaf` + volume leaf | **C1a ✅** · C1b ✅ ([C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md)) |
| Directional sensors + pointing | `beamGainFactor`, `checkPointingGate` | **C2 ✅** |
| Scan time / dwell per cell | `VolumeVisitRecord` + `cellVisitScore` body | D6 / C1-future | seam ready |
| Multi-leg patrol routes | `patrolSweepCellCandidates` body | C1-future | handles + overrides ready |
| Polygon footprint | `discretizeFootprint` body swap | C1-future | `Footprint` union ready |
| Substitutable sensors | `coverageTask` aggregator (A0.3) | D6 | ✅ seam installed |
| Real fleet/comms contention | `CommsModel` graph (**A3 ✅**) | D2 import body | ✅ graph + gate · ingest delay pending D2 |
| Objective unit normalization | `computeObjective` + config λ's (A0.4) | D6 | ✅ seam installed |
| MIP / column-generation solver | `Planner.replan` interface (A0.5) | D6 | ✅ seam installed |

---

## Definition of done (every step) & anti-patterns
**Done =** green tests on the fixture · invariant lint passes · committed with the step id · one tangible
result to show. **Will fail review:** reading `world_truth` in an engine; `Date.now()` inside the coverage
function; a scalar capability; multiplying confidence into coverage; skipping the do-nothing plan;
auto-committing without re-validation; building two steps before the first is green.

**Start with S0** for a greenfield build. **For current work**, start with **Phase D3** in
[EXPANSION_REGISTER.md](EXPANSION_REGISTER.md) (threats / exposure / risk — recommended after D1–D2).
Demo the system: `pnpm --filter @mission-orchestrator/ui dev` → http://localhost:5173 ([SCENARIO_OFFSHORE.md](SCENARIO_OFFSHORE.md)).
Verify with `pnpm db:verify` (**15/15** tables) and `pnpm verify` (~**213** tests + rollup/planner/engine lints).
Refresh env data: `node apps/orchestrator/dist/cli.js env-fetch --all-ticks`.
