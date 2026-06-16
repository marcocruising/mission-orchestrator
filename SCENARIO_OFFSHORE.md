# Offshore pipeline & rig scenario

**ID:** `offshore-pipeline`  
**Source of truth (TypeScript):** `apps/orchestrator/src/scenarios/offshore-pipeline.ts`  
**Database seed:** `supabase/seed.sql`

## Layout

| Item | Value |
|------|--------|
| Operating area | **20 × 20 km** (0…20 on both axes) |
| Geo anchor (D1) | **56.5°N, 1.0°E** — SW corner of local km grid (North Sea sector) |
| Seafloor | **−60 m** (`depth_m: 60`, engine `z_m: −60`) |
| Oil rig (Alpha platform) | **(17, 10) km** |
| Pipeline corridor | AABB center **(9, 10) km**, **14 × 1.5 km** (half 7 × 0.75 km) |

## Fleet (4 assets)

| Asset | Role | Assignment |
|-------|------|------------|
| `usv-sentinel-a` | Surface pipeline patrol | `task-pipeline-surface` (AREA) |
| `usv-sentinel-b` | Rig surface watch | `task-rig-watch` (POINT) |
| `uuv-guardian` | Seafloor pipeline patrol | `task-pipeline-subsea` (AREA) |
| `uav-overwatch` | Air overwatch on rig | `task-rig-air` (POINT) |

## Missions

1. **`mission-rig-guard`** (priority 0.92) — surface + air watch on the rig  
2. **`mission-pipeline-guard`** (priority 0.88) — surface + seafloor volume patrol along the pipeline

## Scripted timeline (ticks 0–8)

| Tick | Story |
|------|--------|
| **2–3** | USV-A and UUV sweep east; **UUV link fails subsea at tick 2** (operator unaware) |
| **4** | **Delayed link-down arrives** — search ellipse blooms and drifts; pipeline confidence drops |
| **5–6** | USV continues patrol alone; UUV dark |
| **6–8** | UUV link restored subsea at tick 6; operator sees recovery at tick **8** (2-hop delay) |

## Environmental data (D1)

Real ocean/weather fields are imported into `environment_samples` before replay:

| Source | Fields | Auth |
|--------|--------|------|
| **Open-Meteo Marine** | `sea_state_hs_m`, `current_u_ms`, `current_v_ms` | None |
| **Open-Meteo Weather** | `wind_ms`, `wind_direction_deg`, `fog_vis_km` | None |
| **Copernicus Marine** | `salinity_psu` (0 m + 60 m) | `COPERNICUSMARINE_*` in `.env` |

```bash
pnpm build

# Fetch all ticks (or let UI Reset do this automatically)
node apps/orchestrator/dist/cli.js env-fetch --all-ticks

# Copernicus salinity requires Python deps:
pip install -r scripts/requirements-env-import.txt
```

**Console Reset** (`/api/reset` or timeline Reset) clears runtime tables, runs `env-fetch --all-ticks`, then replays ticks 0…target.

## Comms topology (D2)

Multi-hop relay graph in `comms_links` (seeded with scenario). Sim clock uses **tick index** as time; each hop adds one tick of latency.

| Asset path | Hops | Total delay |
|------------|------|-------------|
| USV → relay buoy → operator | 2 | 2 ticks |
| UAV → sat terminal → operator | 2 | 2 ticks |
| UUV → acoustic gateway → operator | 2 | 2 ticks |

UUV link fails at **tick 2** (subsea truth); link-down report reaches the operator at **tick 4**. Restore at tick **6** → operator sees at tick **8**.

## Reset & load

```bash
# Apply schema + fresh scenario (truncates demo fleet tables)
pnpm db:setup

# Or re-seed only (requires DATABASE_URL)
psql "$DATABASE_URL" -f supabase/seed.sql
```

## Run the loop

```bash
pnpm build

# Replay ticks 0–8 (each sim+tick advances belief, mission_state, task_volume_visits)
for t in 0 1 2 3 4 5 6 7 8; do
  node apps/orchestrator/dist/cli.js sim $t
  node apps/orchestrator/dist/cli.js tick $t
done

node apps/orchestrator/dist/cli.js inspect 8
```

## Operator console

```bash
pnpm --filter @mission-orchestrator/ui dev
```

Open **http://localhost:5173** — the full operator console (design: [`example_operator_console_design.html`](../example_operator_console_design.html)).

### Layout

| Region | Shows |
|--------|--------|
| **Header** | Mission health pills — coverage bar + confidence dot (separate, P6) |
| **Fleet rail** | 4 assets — z, speed, battery, comms status; click → asset drawer |
| **Plan view** | Top-down 20×20 km chart — pipeline corridor, visited volume cells, rig, drift-aware search ellipses |
| **Profile view** | Water-column side elevation — air / surface / seabed (−60 m), asset depths |
| **Decision column** | Alerts + ranked plan cards; **Accept & commit** applies via orchestrator API |
| **Timeline** | Scenario scrubber (ticks 0–8) — Prev / Next / Reset / slider |

### Visual cues

- **Green cells** = `task_volume_visits` along pipeline corridor (surface + subsea AABB)
- **Gold triangle** = Alpha rig at (17, 10) km
- **Domain colors** — UAV `#7fb3d9` · USV `#38c2b0` · UUV `#5f74e6`
- **Pulsing dashed ellipse** = lost comms / growing search uncertainty (tick 4 on UUV); **center drifts** with imported currents (D1.2)
- **Asset drawer** — sensor base vs **effective** bars reflect live env (Hs, visibility, salinity) when samples loaded
- **Tier colors** on mission pills — FULL `#34b58a` · DEGRADED `#e0a93a` · AT_RISK `#e07d3a` · LOST `#d2495f`

### Walkthrough

1. **Reset** (refreshes env data + replays from tick 0)
2. **Next ▶** through ticks **1–3** — green cells accumulate along corridor
3. **Tick 4** — UUV comms loss: drifting search ellipse, pipeline confidence drops, alert + recommendations
4. **Accept** top plan or continue to **tick 7–8** — UUV comms restored

## What to expect

| After tick | Check (console) |
|------------|-----------------|
| **0** (after Reset) | `environment_samples` populated (~200 rows/tick); USV `eo_ir` effective < base if rough seas |
| **2–3** | Plan view: green cells along corridor; header pill for Pipeline coverage rising |
| **4** | UUV pulsing search ellipse (offset by current drift); pipeline confidence dot hollow; alert in decision column |
| **4+** | Recommendation cards in decision column if salience ≥ 0.4 |
| **7–8** | UUV chevron returns; ellipse clears; visits continue |

## Metadata CLI

```bash
node apps/orchestrator/dist/cli.js scenario
node apps/orchestrator/dist/cli.js env-fetch 0
```
