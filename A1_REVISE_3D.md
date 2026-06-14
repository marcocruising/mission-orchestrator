# A1-revise — 3D spatial model (reference — COMPLETE)

**Status:** **COMPLETE** (June 2026)  
**Next work:** [C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md) · [HANDOVER.md](HANDOVER.md) · [EXPANSION_REGISTER.md](EXPANSION_REGISTER.md) (A0–A4 + B done)  
**Commit target:** `A1-revise: 3D spatial model (cv6, slant range, z-up adapter)`

Read first: [EXPANSION_REGISTER.md](EXPANSION_REGISTER.md) · [HANDOVER.md](HANDOVER.md) · [README.md](README.md)

---

## Why A1-revise exists

A1 initial installed estimation shapes with a **2D state** `[x, y, vx, vy]` and **horizontal-only range** in coverage. The domain already uses `(x_km, y_km, depth_m)` and will need **UAV altitude + submerged depth** on one axis. Doing this **before A2** avoids rewriting `MotionModel`, env sampling, Kalman, and C1 volume patrol.

---

## Locked 3D conventions (do not change without team agreement)

### Vertical axis — z-up, sea surface = 0

| `z_m` | Meaning | Example |
|-------|---------|---------|
| **> 0** | Above surface (altitude) | UAV at 100 m → `+100` |
| **= 0** | At surface | USV |
| **< 0** | Below surface (depth) | UUV at 50 m → `−50` |

**Deeper = more negative.** Positive vz = climbing.

### Engine internal units

- **`Position3 { x_m, y_m, z_m }`** — all meters inside `packages/engine`
- **6D CV state (layout `cv6`):** `[x_m, y_m, z_m, vx, vy, vz]` with 6×6 covariance, velocities in m/s
- **DB/UI boundary:** keep `x_km`, `depth_m`, `target_depth_m` columns (invariant #7 additive-only)

### Legacy adapter — ONLY in `spatial.ts`

```typescript
// Postgres depth_m (positive below surface) → engine
z_m = -depth_m

// Display
altitude_m = Math.max(z_m, 0)
depth_display_m = Math.max(-z_m, 0)
```

Air assets: use **`z_m` belief fact** (positive). Do not write conflicting `depth_m` and `z_m` on the same tick.

### Z gates (z-up)

| Constraint | Rule |
|------------|------|
| Max depth (rating) | `z_m ≥ -depth_rating_m` |
| Min depth (must dive) | `z_m ≤ -min_depth_m` |
| Max altitude (air) | `0 ≤ z_m ≤ max_altitude_m` |

### Range

- **`slantRangeM(a, b)`** — Euclidean 3D in meters
- **`rangeM()` / `rangeKm()` seam** — v1 body = slant; wire into `effectiveQuality` (replaces 2D `hypot`)
- Gates first (P5), then graded range

### Estimation

- Rename/document **`horizontalBearingMeasurement`** — not full 3D triangulation; add `test.todo` for 3D bearing + elevation before Kalman (D6)
- **`migrateEstimate()`** — 4D legacy → 6D with **large z uncertainty**, not point z=0 for unknown depth
- **`covToEllipse`** — horizontal projection of x–y covariance block; add **`zUncertainty`** from cov[Z,Z]

---

## Implementation steps (all complete)

1. **`spatial.ts`** — `Position3`, adapters, `StateLayout`, `slantRangeM`, `rangeM`/`rangeKm` + tests ✅  
2. **`estimate.ts`** — layout `cv6`, 6D mean/cov, `migrateEstimate`, `zUncertainty` + tests ✅  
3. **`measurement.ts` / `estimator.ts`** — 3D measurements, 6D predict/update + tests ✅  
4. **`coverage.ts`** — slant range via `rangeKm`; z monotonicity property tests; retune fixtures ✅  
5. **`searchRegion.ts` + UI + `tracks.ts`** — 6D search uncertainty, `migrateEstimate` on load ✅  
6. **Docs** — EXPANSION_REGISTER / HANDOVER / README synced ✅  

Run after each step: `pnpm verify` · `pnpm db:verify` (14 tables as of A3).

---

## What A1 initial already shipped (2D — upgraded in A1-revise)

| Module | Path | Notes |
|--------|------|-------|
| Estimate / ellipse | `packages/engine/src/estimate.ts` | **6D cv6** |
| Measurement | `packages/engine/src/measurement.ts` | 3D position fix |
| Estimator | `packages/engine/src/estimator.ts` | 6D CV predict |
| Track | `packages/engine/src/track.ts` | Track types + DB row helpers |
| Search region | `packages/engine/src/searchRegion.ts` | 6D reachable set via MotionModel |
| Migration | `supabase/migrations/20250614000006_a1_tracks.sql` | `tracks` table |
| DB loader | `packages/db/src/tracks.ts` | load/upsert tracks |
| UI | `apps/ui/src/App.tsx` | `ownAssetSearchRegion` from engine |

Tests: ~181 passing with 1 Kalman `test.todo` (June 2026 session).

---

## Future phases affected (read before coding)

| Phase | Impact |
|-------|--------|
| **A2** ✅ | `MotionModel` on 6D SI state; `EnvironmentContext.sample(kind, Position3)` |
| **A4** ✅ | `DEFAULT_ENV_FACTORS` with stub salinity/sea-state/fog |
| **B1** ✅ | `computeTaskLeaf` dispatch; rollup leaf-agnostic lint |
| **C1a** ← next | **AABB volume patrol** — `Footprint` seam + `discretizeFootprint`; polygon later as body swap. Spec: [C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md) |
| **C1b** | Planner sweep paths (deferred) |
| **C2** | Needs `inBeamRange` / `elevation_deg` on operating point |
| **D3** | Threats as 2D polygons + z bounds |
| **D5** | LLM formats altitude vs depth from signed z |

---

## Anti-patterns

- Raw `state[n]` outside `spatial.ts` and measurement producers  
- Reading `depth_m` in engine without `z_m = -depth_m` adapter  
- 2D range in coverage after this revise  
- Migrating tracks with z=0 point estimate for unknown depth  
- Implementing relay/comms logic in planner (W5)  
- Reading `task.target_x` inside `computeMissionCoverage` rollup (B1 lint catches this)

---

## Agent workflow

Same as README PRIME DIRECTIVE: tests first → minimal impl → green suite → stop → wait for confirmation.

Phase A + B complete — proceed to **C1a** per [C1_VOLUME_PATROL.md](C1_VOLUME_PATROL.md).
