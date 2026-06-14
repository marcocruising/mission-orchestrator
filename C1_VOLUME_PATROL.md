# C1 — 3D volume patrol (AABB v1) — archive spec

**Status:** **COMPLETE** (June 2026) — C1a + C1b shipped  
**Prerequisites:** Phase A0–A4 ✅ · Phase B guards ✅ · C2 directional sensors ✅  
**Full register:** [EXPANSION_REGISTER.md](EXPANSION_REGISTER.md) § C1 · Runbook: [HANDOVER.md](HANDOVER.md)

> **Agent:** This file documents the **C1 design** for reference. Phase C is complete; new work starts at **Phase D** ([HANDOVER.md](HANDOVER.md)).

---

## Goal

Replace the B1 **AREA stub leaf** (`cov_t = 0.7` constant) with a real **`coverageVolume`** body that computes task coverage as the fraction of **3D cells** in a patrol volume that are adequately covered and recently revisited.

**Rollup stays frozen** — `computeMissionCoverage` only calls `computeTaskLeaf`; B1 lint (`lint-rollup-purity.mjs`) must stay green.

---

## Locked design decisions (do not revisit without user)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Footprint v1** | **AABB** (axis-aligned box) | Simple demo; polygon is a later **body swap** on `Footprint` |
| **Footprint storage** | `footprint jsonb` with `kind` discriminator | Avoids AABB-only columns; polygon adds `{ kind: "polygon", … }` later |
| **Cell identity** | Opaque **`cell_id: string`** in visit state | Not `(i,j,k)` — polygon discretization can reuse same visit table |
| **Visit memory** | **`task_volume_visits`** table, loaded on `EngineInput` | Required for revisit decay across ticks; engine stays pure |
| **Quality per cell** | **`effectiveQuality(sensor, cellCenterAsTarget, vehicle)`** | Reuses envMult/MotionModel seams; D1 salinity/currents apply without volume rewrite |
| **Z frame** | **z-up** SI meters in engine (`z_m`); DB may use `depth_m` at load boundary | Same as [A1_REVISE_3D.md](A1_REVISE_3D.md) |
| **Planner sweep** | **C1b ✅** | `patrol:cell_id` handles; `planningOverrides` sandbox-only; ≤3 cell candidates |
| **Thermocline / isoclines** | **Deferred (D1+)** | C1 uses **fixed** `z_min_m` / `z_max_m`; env affects quality via existing `EnvironmentContext` |

---

## Architecture (three layers — polygon-ready)

```
Footprint (shape)           discretizeFootprint(fp, cell_size_m) → CellSpec[]
Cell coverage (C1 body)     for each cell × assignment × demand → effectiveQuality
Volume rollup               visit memory + revisit decay → cov_t
```

**Do not** bake AABB width/height into `coverageVolume` internals. Only `discretizeFootprint` may branch on `footprint.kind`.

---

## Types (engine — `packages/engine/src/volume/`)

```typescript
/** Horizontal footprint — v1: aabb only; polygon arm added later. */
export type Footprint =
  | {
      kind: "aabb";
      /** Center in engine SI meters (convert from task target_x/y km at load boundary). */
      center: { x_m: number; y_m: number };
      half_extent_m: { x: number; y: number }; // full width = 2× half_extent_m.x
    }
  | { kind: "polygon"; vertices_xy_m: { x_m: number; y_m: number }[] }; // NOT implemented in C1

export interface VolumeCellSpec {
  cell_id: string;       // stable opaque id, e.g. "c:012:034:-02"
  center: Position3;     // z-up meters
}

export interface VolumeVisitRecord {
  cell_id: string;
  last_visit_ts: number;
  peak_quality: number;  // best q seen on last visit
}

export interface AreaTaskParams {
  footprint: Footprint;
  z_min_m: number;       // deeper (more negative) bound for submerged layer
  z_max_m: number;       // shallower (less negative) bound; for air use 0 … max_altitude
  revisit_interval_s: number;
  cell_size_m: number;   // default 500 if omitted
}

export interface VolumeCoverageInput {
  params: AreaTaskParams;
  visits: VolumeVisitRecord[];
  assignments: Assignment[];
  demands: TaskDemand[];  // reuse task_demands — same sensor axes as POINT
  // … belief, assets, sensors, config, now, environmentContext, resolveOperatingPoint
}
```

Extend **`TaskDef`** (already has `kind?: 'POINT' | 'AREA'`):

```typescript
area?: AreaTaskParams;  // present when kind === 'AREA'
```

---

## DB migration (apply via Supabase MCP `apply_migration`)

**Name suggestion:** `c1_volume_patrol`

```sql
-- tasks: kind + volume params (additive)
alter table public.tasks
  add column if not exists kind text not null default 'POINT'
    check (kind in ('POINT', 'AREA'));

alter table public.tasks
  add column if not exists footprint jsonb,
  add column if not exists z_min_m double precision,
  add column if not exists z_max_m double precision,
  add column if not exists revisit_interval_s bigint,
  add column if not exists cell_size_m double precision default 500;

-- Visit memory for revisit decay (engine read/write via db adapter each tick)
create table public.task_volume_visits (
  task_id text not null references public.tasks(id) on delete cascade,
  cell_id text not null,
  last_visit_ts bigint not null,
  peak_quality double precision not null,
  primary key (task_id, cell_id)
);

alter table public.task_volume_visits enable row level security;
create policy "task_volume_visits_select" on public.task_volume_visits
  for select to authenticated, anon using (true);
create policy "task_volume_visits_all_service" on public.task_volume_visits
  for all to service_role using (true) with check (true);
```

**AABB `footprint` jsonb example:**

```json
{
  "kind": "aabb",
  "center_x_km": 2.0,
  "center_y_km": 0.0,
  "half_width_km": 1.0,
  "half_height_km": 1.0
}
```

Store horizontal center in **km at DB boundary** (matches `target_x`/`target_y` convention); convert to meters in loader. Alternatively center can match `target_x`/`target_y` columns and footprint jsonb only holds half extents — **pick one in loader, document in code**.

**`pnpm db:verify`:** add `task_volume_visits` → expect **15/15** tables.

---

## Algorithm: `discretizeFootprint` (AABB v1)

1. Parse AABB: x ∈ [center.x − hx, center.x + hx], y similarly.
2. z ∈ [z_min_m, z_max_m] (inclusive steps of `cell_size_m`).
3. Cell centers at half-cell offsets; **`cell_id`** = deterministic string from quantized indices (not array indices alone — include z band).
4. Return `VolumeCellSpec[]`.

**Submerged example:** patrol layer 80 m–40 m depth → `z_min_m = -80`, `z_max_m = -40`.

---

## Algorithm: `coverageVolume` (C1 body)

For each **sensor demand** on the task (same loop pattern as `computePointTaskLeaf`):

1. **Discretize** volume → cells (once per eval).
2. For each **assignment** on this task:
   - Resolve vehicle pose from belief + `resolveOperatingPoint`.
   - Run **`checkHardConstraints`** (depth/domain gates — P5).
   - For each **cell**:
     - `q = effectiveQuality(sensor, { target from cell.center }, vehicle, config.p, DEFAULT_ENV_FACTORS, environmentContext)`
     - If `q` not INFEASIBLE and `q >= demand.min_quality`: mark cell visited at `now` with `peak_quality = max(existing, q)`.
3. **Merge** with prior `visits` from input; update `last_visit_ts` / `peak_quality` for touched cells.
4. **Per-cell score** (after visit merge):
   - If never visited → `0`
   - If `now - last_visit_ts > revisit_interval_s` → decay (v1: linear ramp to 0 over one interval, or step to 0 — **pick one, test it**)
   - Else → `peak_quality` (or 1.0 if quality already gated — **document choice**)
5. **Axis satisfaction** for this demand: `mean(cell_scores)` or `min` — **use mean for v1** (volume is already spatial aggregate); then apply same multi-demand **`coverageTask(min across axes)`** as POINT.
6. Return `{ cov_t, freshnessValues, infeasible }` + **updated visit records** for persistence.

**Register tests (must pass):**

| Test | How |
|------|-----|
| Coverage rises with cells covered | 1 vehicle moves into volume → cov_t increases |
| Unrevisited cells decay | advance `now` past `revisit_interval_s` without revisit → cov_t drops |
| One vehicle cannot blanket instantly | volume larger than sensor range → cov_t < 1 with one asset |
| Rollup unchanged | `guard.test.ts` mixed POINT+AREA mission still passes |
| B1 lint | `lint-rollup-purity.mjs` green |

---

## Environment: currents, salinity, thermocline (no C1-specific code)

| Phenomenon | C1 behavior | Later |
|------------|-------------|-------|
| **Currents** | Belief position already used; when D1 adds drift to `MotionModel`, cell visitation improves automatically | D1 |
| **Salinity isoclines** | `effectiveQuality` per **cell center** → `salinityFactor` stub (=1 today) | D1 body |
| **Thermocline** | Fixed `z_min_m` / `z_max_m` on task | D1+ optional dynamic z band |

**Anti-pattern:** salinity/thermocline formulas inside `coverageVolume.ts`.

---

| Step | Work | Status |
|------|------|--------|
| **C1.1** | Types: `Footprint`, `VolumeCellSpec`, `AreaTaskParams`; `discretizeFootprint` AABB + tests | ✅ |
| **C1.2** | `coverageVolume.ts` + tests (no DB) | ✅ |
| **C1.3** | Wire `computeAreaTaskLeaf` → `coverageVolume`; remove stub | ✅ |
| **C1.4** | DB migration + visit load-save in `packages/db` | ✅ 15/15 tables |
| **C1.5** | `EngineInput.volumeVisits` + tick persistence | ✅ |
| **C1.6** | Demo seed: `mission-volume` / `task-volume` | ✅ |
| **C1b** | `patrolSweep.ts`, `planningOverrides`, planner candidates | ✅ |

---

## C1b — Planner patrol sweep (shipped)

Minimal functional sweep — **not** a route optimizer. Preserves seams for future scan time / multi-leg paths.

| Item | Implementation |
|------|----------------|
| **Handle format** | `patrol:{cell_id}` — opaque to planner (B3 lint) |
| **Candidate selection** | Up to 3 lowest-scoring / unvisited cells via `patrolSweepCellCandidates` |
| **Sandbox eval** | `EngineInput.planningOverrides: Map<asset_id, Position3>` — cell center as hypothetical position |
| **Live tick** | Never sets `planningOverrides` — belief position only |
| **Resolver** | `parsePatrolHandle` in `operatingPoint.ts` → SLOW listen speed |

**Future body swaps (no rollup rewrite):** multi-leg waypoints · travel-time cost in `ObjectiveTerm[]` · per-cell `dwell_s` on `VolumeVisitRecord` · scan completion in `cellVisitScore`.

---

## Files shipped

| File | Purpose |
|------|---------|
| `packages/engine/src/volume/footprint.ts` | `Footprint`, `discretizeFootprint` (aabb) |
| `packages/engine/src/volume/coverageVolume.ts` | Volume leaf body |
| `packages/engine/src/volume/patrolSweep.ts` | C1b patrol handles + planning overrides |
| `packages/engine/src/vehicleState.ts` | `buildVehicleState` — belief + pointing + override |
| `packages/engine/src/volume/*.test.ts` | C1a tests |
| `packages/engine/src/volume/patrolSweep.test.ts` | C1b tests |
| `packages/engine/src/stateEngine.ts` | `computeAreaTaskLeaf`, `volumeVisits`, `planningOverrides` |
| `packages/db/src/volume.ts` | Load/save visits, parse footprint jsonb |
| `supabase/migrations/20250614000009_c1_volume_patrol.sql` | DDL |
| `packages/engine/src/directional.test.ts` | C1b planner + C2 integration tests |

---

## Deferred (explicit — future body swaps)

| ID | Scope |
|----|--------|
| **C1-polygon** | `{ kind: "polygon" }` in `Footprint` + discretizer body |
| **C1-thermocline** | Dynamic z band from `temperature_c` env field |
| **C1-routes** | Multi-leg patrol paths, travel-time objective |
| **C1-scan** | Per-cell `dwell_s` / scan time on `VolumeVisitRecord` |

---

## Demo scenario (recommended seed)

- **Mission:** subsurface box patrol  
- **Volume:** center `(2 km, 0)`, half 1 km × 1 km, `z_min_m = -80`, `z_max_m = -40`, `cell_size_m = 500`, `revisit_interval_s = 600`  
- **Asset:** `uuv-1` with passive_acoustic, assigned to AREA task  
- **Expect:** cov_t depends on position; decay after 600 s without revisit  

---

## Health check

```bash
pnpm db:verify && pnpm verify
# 15/15 tables · ~200 tests · lint-rollup + lint-planner + lint-engine green
```

---

## Learnings (C1 implementation)

1. **AREA tasks need assignments** on the AREA `task_id` — otherwise `cov_t = 0` (guard tests use dual assignment for mixed missions).
2. **Revisit decay tests** must move the vehicle out of range on the stale tick, or fresh visits mask decay.
3. **Cell count** — half_extent 500 m + cell_size 500 m → 1 cell per axis; use 250 m half_extent for single-cell fixtures.
4. **`planningOverrides`** must never leak to live tick — only planner sandbox in `evaluatePlan`.
5. **Footprint jsonb** stores km at DB boundary (`center_x_km`, `half_width_km`); engine uses meters via `parseFootprintJson`.

---

## Agent workflow

Phase C complete. For new work see [HANDOVER.md](HANDOVER.md) and [EXPANSION_REGISTER.md](EXPANSION_REGISTER.md) § Phase D.
