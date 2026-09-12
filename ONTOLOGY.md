# Mission Orchestrator — Project Ontology

> **Purpose:** Single-operator decision support for a fleet of unmanned naval vehicles (UAV / USV / UUV). When a vehicle fails or degrades, the system recomputes mission health, raises alerts, ranks reassignment plans, and lets the operator commit — never auto-commits.

This document maps **what exists**, **how pieces relate**, and **where logic lives**. For build history see [HANDOVER.md](HANDOVER.md); for formulas see [BUILD.md](BUILD.md).

---

## 1. System at a glance

```mermaid
flowchart TB
  subgraph External["External / offline"]
    COP["Copernicus / Open-Meteo"]
    ENV_IMPORT["packages/env-import"]
    COP --> ENV_IMPORT
  end

  subgraph Apps["Applications"]
  UI["apps/ui<br/>Operator console"]
  ORCH["apps/orchestrator<br/>Tick loop + CLI + dev API"]
  end

  subgraph Packages["Pure logic + data access"]
  ENG["packages/engine<br/>ZERO deps — pure functions"]
  DB["packages/db<br/>Supabase typed loaders"]
  end

  subgraph Storage["Supabase (Postgres)"]
  TABLES[("17 tables<br/>belief · missions · plans · env · threats")]
  end

  ENV_IMPORT --> TABLES
  UI -->|"Realtime subscribe"| TABLES
  UI -->|"POST /api/tick/*, /api/apply-plan"| ORCH
  ORCH --> DB
  DB --> TABLES
  ORCH --> ENG
  DB --> ENG
  UI -.->|"display-only math"| ENG
```

| Layer | Role | Reads `world_truth`? |
|-------|------|----------------------|
| **Simulator** (engine) | Writes ground truth + noisy reports (demo only) | Writes only |
| **Ingest** (engine) | Reports → `Belief` via `reconcile()` | Never |
| **State engine** (engine) | Pure `(belief, assignments, missions, now) → MissionState` | Never |
| **Planner** (engine) | Sandboxes moves, re-runs state engine, ranks `Obj` | Never |
| **Orchestrator** | Owns clock, persists rows, wires I/O | Never in engine path |
| **UI** | Read-mostly; operator commits plans | Never |

---

## 2. Monorepo package ontology

```mermaid
graph LR
  subgraph engine["packages/engine — the brain"]
    direction TB
    TYPES["types · spatial · freshness"]
    PERCEPT["ingest · reconcile · simulator"]
    COV["coverage · envMult · pointingGate"]
    STATE["stateEngine · vehicleState"]
    VOL["volume/ — patrol cells & sweep"]
    PLAN["planner · applyPlan · objective · routePlanner"]
    AUX["monitor · summarize · motionModel · estimator · track"]
    TYPES --> PERCEPT
    TYPES --> COV
    COV --> STATE
    VOL --> STATE
    STATE --> PLAN
    AUX --> PLAN
  end

  subgraph db["packages/db — adapters"]
    CLIENT["client"]
    LOADERS["belief · missions · comms · environment · volume · threats"]
    BUILD["buildEngineInputFromDb"]
    LOADERS --> BUILD
  end

  subgraph orch["apps/orchestrator"]
    TICK["tick.ts — runTick loop"]
    CLI["cli.ts — inspect, env-fetch"]
    SCEN["scenario-run.ts + scenarios/"]
    API["api-handlers.ts"]
  end

  subgraph ui["apps/ui"]
    APP["App.tsx — fleet rail, alerts, plans"]
    VIEWS["PlanView · ProfileView"]
    LIB["lib.ts — DB row types + display helpers"]
  end

  subgraph envi["packages/env-import"]
    FETCH["fetchEnvironment — marine + weather grids"]
  end

  db --> engine
  orch --> db
  orch --> engine
  ui --> lib
  envi --> db
```

**Dependency rule (CI-enforced):** `packages/engine` has **no** database imports and **no** references to `world_truth`. All I/O stays in `packages/db` and `apps/orchestrator`.

---

## 3. Domain entity ontology

Concepts are grouped by **concern**. Arrows mean “feeds” or “owns”.

```mermaid
erDiagram
  ASSET ||--o{ ASSET_SENSOR : "capability vector"
  ASSET ||--o{ BELIEF_FACT : "known state"
  ASSET ||--o{ ASSIGNMENT : "currently assigned"
  ASSET ||--o{ REPORT : "telemetry packets"

  MISSION ||--|{ TASK : "contains"
  TASK ||--o{ TASK_DEMAND : "graded sensor need"
  TASK ||--o{ TASK_CONSTRAINT : "hard gate"
  TASK ||--o{ TASK_VOLUME_VISIT : "patrol memory (AREA)"
  TASK ||--o{ ASSIGNMENT : "work target"

  MISSION ||--o{ MISSION_STATE : "derived each tick"
  MISSION ||--o{ ALERT_LOG : "when salient"

  CANDIDATE_PLAN ||--|| PLAN_EVAL : "ranked score"
  DECISION_LOG }o--|| CANDIDATE_PLAN : "operator choice"

  COMMS_NODE ||--o{ COMMS_LINK : "graph"
  ENVIRONMENT_SAMPLE }o--|| TASK : "sampled near targets"
  THREAT }o--|| ROUTE_PLANNER : "exposure/risk"
  NO_GO_ZONE }o--|| ROUTE_PLANNER : "hard prune"

  ASSET {
    string id PK
    enum kind "UAV|USV|UUV"
    enum domain "air|surface|subsurface"
    float depth_rating_m
    float top_speed_kn
  }

  ASSET_SENSOR {
    string asset_id FK
    string sensor PK
    float base_quality
    float max_range_km
    float k_motion
    float beam_half_angle_deg "nullable — C2"
  }

  BELIEF_FACT {
    string asset_id PK
    string field PK
    jsonb value
    bigint ts
    float confidence
    float half_life_s
  }

  MISSION {
    string id PK
    float priority "W_m"
    string name
  }

  TASK {
    string id PK
    string mission_id FK
    float w_t
    enum kind "POINT|AREA"
    float target_x target_y
    jsonb footprint "AREA only"
  }

  MISSION_STATE {
    string mission_id FK
    bigint tick
    float cov_baseline "sticky"
    float cov_now
    enum tier "FULL|DEGRADED|AT_RISK|LOST"
    float confidence
    float impact urgency salience
  }

  ASSIGNMENT {
    string asset_id FK
    string task_id FK
    string operating_point "STATION|SLOW|FAST"
  }
```

### Entity roles (plain language)

| Entity | Mutable by | Meaning |
|--------|------------|---------|
| **Asset / AssetSensor** | Seed / admin | Static fleet spec; capability is a **vector** over sensors (P4) |
| **WorldTruth** | Simulator only | Ground truth for demos — engine never reads it |
| **Report** | Simulator | Raw packets (may drop, delay, drift) |
| **BeliefFact** | Ingest | System knowledge; keyed `(asset_id, field)` |
| **Mission / Task** | Seed / operator | Demand side: tasks bundle demands + hard constraints |
| **Assignment** | Plans (`applyPlan`) | Supply side: who does what at which operating point |
| **MissionState** | State engine each tick | **The one derived object** (P3) — alerts & planner read this |
| **AlertLog** | Monitor + summarize | Append-only; `summary_text` is narration only (P8) |
| **CandidatePlan / PlanEval** | Planner | Ranked options including do-nothing (P9) |
| **DecisionLog** | Operator commit | Accountability trail |
| **Config** | Seed | Tunables: tiers, λ weights, half-life H, salience σ |

---

## 4. Belief pipeline (perception layer)

```mermaid
sequenceDiagram
  participant SIM as Simulator
  participant RPT as reports table
  participant ING as ingestReports
  participant REC as reconcile
  participant BF as belief_facts
  participant CM as CommsModel

  SIM->>RPT: write packets (ts, asset, field, value)
  Note over SIM: world_truth parallel<br/>(sim ground truth only)

  RPT->>ING: load reports ≤ now
  ING->>CM: pathDelay(sentTs) — D2
  CM-->>ING: delivery ts
  alt delivery_ts > now
    ING-->>ING: hold (not merged)
  else delivered
    ING->>REC: merge conflicting facts
    REC-->>ING: new Belief Map
  end
  ING->>BF: upsert belief_facts
```

**Key invariants:**
- Belief is a `Map<asset_id:field, Fact>` with time-decayed confidence: `freshness(Δt) = exp(−Δt / H)`.
- `reconcile()` is the seam for spoofing / adversarial data (D4 — body stub installed).
- Comms graph (`comms_nodes`, `comms_links`) affects **when** facts arrive, not what the engine computes.

---

## 5. Tick loop — order of operations

The orchestrator owns **`now`** (one tick = one second in demo). The engine never calls `Date.now()`.

```mermaid
flowchart TD
  START([Tick N begins]) --> SIM{Simulator<br/>enabled?}
  SIM -->|yes| INSERT_RPT[insert reports]
  SIM -->|no| LOAD
  INSERT_RPT --> LOAD

  LOAD[load comms + reports] --> INGEST[ingestReports → Belief]
  INGEST --> PERSIST_BF[upsert belief_facts]

  PERSIST_BF --> BUILD[buildEngineInputFromDb]
  BUILD --> RECOMPUTE[recomputeMissionStatesWithVisits]

  RECOMPUTE --> PERSIST_MS[persist mission_state rows]
  RECOMPUTE --> PERSIST_VV[upsert task_volume_visits]

  PERSIST_MS --> MONITOR[scanBelief → Disruptions]
  MONITOR --> SAL{salience ≥ σ<br/>for any mission?}

  SAL -->|no| END([Return TickResult])
  SAL -->|yes| PLAN[generateCandidates]
  PLAN --> PERSIST_PLANS[persist candidate_plans + plan_eval]
  PERSIST_PLANS --> END

  subgraph OperatorPath["Operator path (async)"]
    UI_ACCEPT[UI: Accept plan] --> APPLY[applyPlan re-validate]
    APPLY -->|ok| WRITE_ASN[update assignments + decision_log]
    APPLY -->|stale| REJECT[reject — belief moved]
    WRITE_ASN --> START
  end
```

**`buildEngineInputFromDb` loads in parallel:**
`belief`, `assets`, `sensors`, `missions`, `assignments`, `config`, `covBaselines`, `environmentContext`, `commsModel`, `volumeVisits`, `routePlanner`.

---

## 6. Coverage engine — logic hierarchy

The state engine is a **pure function** of `(belief, assignments, missionDefs, now)` (P2). The planner simulates futures by calling the **same** function on cloned assignments.

```mermaid
flowchart TB
  subgraph Leaf["Task leaf (POINT or AREA)"]
    direction TB
    L1[For each sensor demand axis]
    L2[For each assigned vehicle]
    L3{Hard constraints?<br/>depth · domain · los}
    L4[effectiveQuality q]
    L5[satisfaction sat = min Σq/demand, 1]
    L6[cov_t = min over axes — Liebig]
    L1 --> L2 --> L3
    L3 -->|fail| INF[INFEASIBLE — prune]
    L3 -->|pass| L4 --> L5 --> L6
  end

  subgraph Quality["effectiveQuality q(v,s,t)"]
    Q1[slantRangeKm — 3D]
    Q2[rangeMult — gate if R > Rmax]
    Q3[envMult — Π factors motion·salinity·fog·seaState]
    Q4[beamGainFactor — C2 directional]
    Q5[q = base · rangeMult · envMult · beam]
    Q1 --> Q2 --> Q3 --> Q4 --> Q5
  end

  L4 --> Quality

  subgraph MissionRollup["Mission rollup"]
    M1[cov_m = Σ w_t·cov_t / Σ w_t]
    M2[tier from cov_m thresholds]
    M3[confidence_m = min freshness of feeding facts]
    M4[impact = W_m · cov_baseline − cov_now]
    M5[urgency from time_to_act_s]
    M6[salience = impact · urgency · confidence]
    M1 --> M2 --> M3 --> M4 --> M5 --> M6
  end

  L6 --> M1
```

### Formula reference

| Symbol | Formula | Principle |
|--------|---------|-----------|
| `freshness` | `exp(−Δt / H)` | Facts decay; H from config |
| `rangeMult` | `(1 − R/Rmax)^p` | Gate: `R > Rmax` → INFEASIBLE (P5) |
| `envMult` | `Π_k m_k(context, sensor)` | Extensible factor list (P1) |
| `sat(t,s)` | `min(Σ_v q / demand, 1)` | Vehicles team on same axis |
| `cov_t` | `min_s sat(t,s)` | Task = weakest sensor (P7) |
| `cov_m` | weighted avg of `cov_t` | Mission tolerates weak minor tasks (P7) |
| `confidence` | min freshness | **Never** multiplied into coverage (P6) |
| `salience` | `impact · urgency · confidence` | Alert if ≥ σ |

### Task kinds

| Kind | Leaf module | Extra state |
|------|-------------|-------------|
| **POINT** | `computePointTaskLeaf` | Fixed target `(x, y, depth)` |
| **AREA** | `coverageVolume` (C1) | Discretized footprint cells + `task_volume_visits` memory |

---

## 7. Planning ontology

```mermaid
flowchart LR
  subgraph Candidates["generateCandidates"]
    DN[do-nothing baseline]
    R1[1-move reassignments]
    R2[set_operating_point SLOW/FAST]
    SW[patrol sweep moves — C1b]
    DN --> EVAL
    R1 --> EVAL
    R2 --> EVAL
    SW --> EVAL
  end

  subgraph Gates["Hard gates — fail = plan dropped"]
    G1[checkCapacityGate]
    G2[checkFleetCommsGate]
    G3[checkPointingGate — C2]
    G4[checkNoGoGate — D3]
  end

  subgraph EVAL["evaluatePlan (per survivor)"]
    CLONE[clone assignments + apply moves]
    SANDBOX[optional planningOverrides — patrol positions]
    RERUN[recomputeMissionStates — same engine]
    ROUTE[RoutePlanner exposure + risk]
    OBJ[computeObjective — Σ terms]
    CLONE --> SANDBOX --> RERUN --> ROUTE --> OBJ
  end

  EVAL --> GATES
  GATES --> RANK[sort by objective DESC]
  RANK --> TOP[top plans → DB + UI]
```

### Plan move types

```typescript
type PlanMove =
  | { kind: "reassign"; asset_id; task_id; operating_point }
  | { kind: "set_operating_point"; asset_id; operating_point };
```

### Objective (ranking only — P10)

```
Obj(plan) = Σ_m W_m·cov_m(plan)
          − λ_move·moves
          − λ_exp·exposure
          − λ_risk·risk
```

Terms are registered in `DEFAULT_OBJECTIVE_TERMS` — same extensibility pattern as `envMult` factors.

### Commit path

`applyPlan` **re-validates** against **current** belief (not the snapshot from evaluation). Stale plans are rejected; committed plans write `assignments` and append `decision_log`.

---

## 8. Seam architecture (contracts vs bodies)

The project follows **P1 — contracts freeze, bodies expand**. Callers depend on a **frozen contract** (function signature, interface, or registry list). Complexity enters by **swapping or extending the body** behind that contract — never by reshaping what upstream code calls.

Full build history and phase IDs: [EXPANSION_REGISTER.md](EXPANSION_REGISTER.md).

### Contract vs body (the pattern)

```mermaid
flowchart LR
  subgraph Callers["Frozen callers — do not change"]
    TICK["tick.ts"]
    PLAN["planner.ts"]
    ING["ingest.ts"]
    COV["coverage.ts"]
  end

  subgraph Contract["Frozen contract"]
    IFACE["interface / signature / registry[]"]
  end

  subgraph Bodies["Swappable bodies"]
    V1["v1 body — shipped today"]
    V2["v2 body — future phase"]
  end

  TICK --> IFACE
  PLAN --> IFACE
  ING --> IFACE
  COV --> IFACE
  IFACE --> V1
  IFACE -.->|"swap, don't rewrite callers"| V2
```

**Rules:**
- Add new behavior by **registering** into a list (`EnvFactor[]`, `ObjectiveTerm[]`) or **implementing** an interface (`Planner`, `RoutePlanner`, `Summarizer`).
- Hard cutoffs stay **gates** (return `INFEASIBLE` / `false`) — never low scores (P5).
- `EngineInput` is the injection point: bodies receive context via fields (`commsModel`, `environmentContext`, `routePlanner`), never via DB reads inside the engine (W8).

### Seam map (by concern)

```mermaid
flowchart TB
  ROOT["Engine seams"]

  ROOT --> PERC["Perception"]
  PERC --> P1["reconcile()"]
  PERC --> P2["ingestReports + CommsModel"]

  ROOT --> QUAL["Quality"]
  QUAL --> Q1["envMult — EnvFactor[]"]
  QUAL --> Q2["beamGainFactor"]
  QUAL --> Q3["OperatingPointResolver"]

  ROOT --> COVR["Coverage"]
  COVR --> C1["computeTaskLeaf — POINT | AREA"]
  COVR --> C2["AxisAggregator"]
  COVR --> C3["discretizeFootprint + coverageVolume"]

  ROOT --> PLN["Planning"]
  PLN --> PL1["Planner.replan"]
  PLN --> PL2["RoutePlanner.measure"]
  PLN --> PL3["planningOverrides — sandbox only"]

  ROOT --> NAR["Narration"]
  NAR --> N1["Summarizer"]

  ROOT --> EST["Estimation"]
  EST --> E1["Estimator"]
  EST --> E2["MotionModel"]

  P1 -.->|D4 next| P1F["spoofing body"]
  P2 -.->|D2 done| P2F["pathDelay + hold"]
  Q1 -.->|D1 done| Q1F["salinity · seaState · fog"]
  Q2 -.->|C2 done| Q2F["3D cone gain"]
  PL1 -.->|D6| PL1F["MIP / column-gen"]
  N1 -.->|D5| N1F["LLM prose"]
  E1 -.->|D6| E1F["Kalman filter"]
```

### Complete seam registry

| Concern | Contract (frozen) | Module | Current body | Next body | Status |
|---------|-----------------|--------|--------------|-----------|--------|
| **Perception** | `reconcile(existing, incoming) → Fact` | `reconcile.ts` | Newer `ts` wins; confidence passthrough | Lower confidence on conflicting sources | **stub** → D4 |
| **Perception** | `ingestReports(reports, belief, opts?) → Belief` | `ingest.ts` | Merge via `reconcile`; optional comms hold | — | **live** (D2) |
| **Perception** | `CommsModel.route / pathDelay / linkUtilization` | `commsModel.ts` | BFS graph routing; per-link utilization gate | Fleet contention bodies | **live** (A3/D2) |
| **Quality** | `envMult(factors[], ctx) → number` | `envMult.ts` | `Π EnvFactor` over `DEFAULT_ENV_FACTORS` | Add factors only — no core change | **live** |
| **Quality** | `EnvFactor = (ctx) → number` | `envFactors/*` | motion, salinity, seaState, fog, beamGain | Wind chop, turbidity, … | **live** (D1/C2) |
| **Quality** | `OperatingPointResolver(asset, handle) → ResolvedOperatingPoint` | `operatingPoint.ts` | `STATION` / `SLOW` / `FAST`, numeric speed, JSON bearing, `patrol:cell_id` | Continuous speed curves | **live** → D6 |
| **Coverage** | `computeTaskLeaf(task, assignments, input)` | `stateEngine.ts` | Dispatch `POINT` → point leaf, `AREA` → volume leaf | New leaf kinds register here | **live** |
| **Coverage** | `AxisAggregator(axisSats[]) → number` | `coverage.ts` | `minAxisAggregator` (Liebig); `meanAxisAggregator` stub | Substitutable sensor groups | **seam ready** → D6 |
| **Coverage** | `discretizeFootprint(footprint) → cells` | `volume/footprint.ts` | AABB grid discretizer | Polygon / sector bodies | **seam ready** |
| **Coverage** | `coverageVolume(params) → cov_t + visits` | `volume/coverageVolume.ts` | Per-cell quality + linear revisit decay | Scan time / dwell scoring | **live** → D6 |
| **Coverage** | `patrolSweepCellCandidates` + `planningOverrides` | `volume/patrolSweep.ts` | Max 3 cell candidates; sandbox positions only | Multi-leg patrol routes | **live** (C1b) |
| **Coverage** | `checkPointingGate(...)` | `pointingGate.ts` | Directional sensors must bear on target | — | **live** (C2) |
| **Planning** | `Planner.replan(request) → PlanEval[]` | `planner.ts` | `defaultPlanner`: 1–2 move heuristic + do-nothing | `stubPlanner` for tests; MIP later | **live** → D6 |
| **Planning** | `RoutePlanner.measure(input) → {exposure, risk}` | `routePlanner.ts` | Segment proximity to threat discs; no-go hard gate | Threat-avoiding path geometry | **live** (D3) |
| **Planning** | `ObjectiveTerm(ctx) → number` | `objective.ts` | coverage reward − move − exposure − risk | Fuel, comms load, route distance | **live** |
| **Planning** | `applyPlan(plan, input, evalTs, now)` | `applyPlan.ts` | Re-run all gates + state engine at commit time | — | **live** |
| **Narration** | `Summarizer(state) → string` | `summarize.ts` | `templateSummarizer` — tier + cov + salience | LLM call (writes prose only — P8) | **stub** → D5 |
| **Estimation** | `Estimator.update(meas, state) → Estimate` | `estimator.ts` | `FixedGainEstimator` (6D CV) | Kalman / particle filter | **seam ready** → D6 |
| **Estimation** | `MotionModel.propagate(state, dt, env) → state` | `motionModel.ts` | `ConstantVelocityModel` + `environmentDriftMs` | Dynamics-aware `half_life` | **live** (A2/D1) |
| **Estimation** | `ownAssetSearchUncertainty(...)` | `searchRegion.ts` | 6D reachable set on comms loss | — | **live** (A1/A2) |

**Status key:** **live** = production body shipped · **stub** = seam installed, minimal body · **seam ready** = interface exists, body swap pending

### Two extensibility patterns (use the right one)

```mermaid
flowchart TB
  subgraph Product["Pattern A — multiplicative factors"]
    EM["envMult(factors[], ctx)"]
    F1["motionEnvFactor"]
    F2["salinityFactor"]
    F3["fogFactor"]
    F4["beamGainFactor"]
    F1 & F2 & F3 & F4 --> EM
  end

  subgraph Sum["Pattern B — additive terms"]
    OBJ["computeObjective(terms[], ctx)"]
    T1["coverageRewardTerm"]
    T2["moveCountPenaltyTerm"]
    T3["exposurePenaltyTerm"]
    T4["riskPenaltyTerm"]
    T1 & T2 & T3 & T4 --> OBJ
  end
```

| Pattern | Used for | How to extend |
|---------|----------|---------------|
| **Product** (`EnvFactor[]`) | Sensor quality degradation | Append to `DEFAULT_ENV_FACTORS` — no `effectiveQuality` changes |
| **Sum** (`ObjectiveTerm[]`) | Plan ranking penalties/rewards | Append to `DEFAULT_OBJECTIVE_TERMS` — no `generateCandidates` changes |
| **Interface swap** | Whole-algorithm replacement | Implement `Planner`, `RoutePlanner`, `Summarizer`, `Estimator`; inject via `EngineInput` or optional arg |
| **Dispatch** | Leaf-kind branching | Add case in `computeTaskLeaf` only — rollup (`coverageMission`) stays unchanged |

### What must NOT change when swapping a body

| Caller | Must keep calling |
|--------|-------------------|
| `tick.ts` | `recomputeMissionStatesWithVisits(input, tick)` — same signature |
| `planner.ts` | `recomputeMissionStates` on sandboxed `EngineInput` clone |
| `ingest.ts` | `reconcile()` for every merge — never inline merge logic |
| `monitor.ts` | Reads `MissionState` rows — never recomputes coverage |
| `summarize.ts` | Receives pre-computed numbers — never computes salience (P8) |
| CI guards | `lint-engine.mjs`, `lint-rollup-purity.mjs`, `lint-planner-purity.mjs` |

### Recommended swap order (from EXPANSION_REGISTER)

```mermaid
flowchart LR
  DONE["D1 env · D2 comms · D3 threats · C1/C2 volume/beam"]
  D4["D4 reconcile — spoofing"]
  D5["D5 summarize — LLM"]
  D6["D6 Kalman · MIP · polygon · dwell"]

  DONE --> D4 --> D5
  D4 --> D6
  D5 --> D6
```

**Next recommended work:** **D4** — implement spoofing in `reconcile.ts` (conflicting reports lower confidence instead of silently overwriting belief).

---

## 9. UI ontology

```mermaid
flowchart TB
  subgraph DataSources["Data sources"]
    RT[Supabase Realtime subscriptions]
    API[Dev API via Vite plugin]
  end

  subgraph AppShell["App.tsx"]
    FLEET[Fleet rail — asset status]
    HEALTH[Mission health pills — cov + confidence separate]
    ALERTS[Alert triage panel]
    PLANS[Ranked plan cards A/B/C…]
    DRAWER[Asset drawer — sensors base vs effective]
    SCRUB[Scenario tick scrubber]
  end

  subgraph Views["Tactical views"]
    PLAN_V[PlanView — map + ellipses + threats]
    PROF_V[ProfileView — water column z profile]
  end

  RT --> AppShell
  API --> SCRUB
  API --> PLANS
  SCRUB -->|POST /api/tick/goto| ORCH2[orchestrator]
  PLANS -->|POST /api/apply-plan| ORCH2

  AppShell --> Views
```

The UI **displays** engine concepts (tier, salience, effective quality) but does not own business logic. Operator actions flow back through the orchestrator API.

---

## 10. Environment & threats (supporting ontology)

```mermaid
flowchart LR
  subgraph Import["env-import (offline)"]
    CM[Copernicus Marine]
    OM[Open-Meteo]
    GRID[sampleGrid near task targets]
    CM --> GRID
    OM --> GRID
  end

  GRID --> ES[(environment_samples)]

  ES --> LEC[loadEnvironmentContext]
  LEC --> CTX[EnvironmentContext]
  CTX --> EM[envMult in effectiveQuality]
  CTX --> MM[MotionModel.environmentDriftMs]

  TH[(threats)] --> RP[RoutePlanner]
  NG[(no_go_zones)] --> RP
  RP --> OBJ2[exposure + risk terms]
  RP --> GATE[checkNoGoGate]
```

---

## 11. Design principles crosswalk

| ID | Principle | Where enforced |
|----|-----------|----------------|
| P1 | Contracts freeze, bodies expand | Seam files + EXPANSION_REGISTER |
| P2 | State engine is pure | `stateEngine.ts`; `lint-engine.mjs` |
| P3 | `MissionState` is the one derived object | `recomputeMissionStates`; no duplicate math in monitor/planner |
| P4 | Capability is a sensor vector | `asset_sensors` rows; `checkCapacityGate` |
| P5 | Gate then grade | `INFEASIBLE` before scoring; `task_constraints` vs `task_demands` |
| P6 | Coverage ≠ confidence | Separate columns; property tests |
| P7 | min within task, weighted avg across mission | `coverageTask` / `coverageMission` |
| P8 | LLM narrates only | `summarize()`; `alert_log.summary_text` |
| P9 | Do-nothing plan always evaluated | `generateCandidates` baseline |
| P10 | Objective ranks, doesn't reveal truth | Config λ weights; operator commits |

---

## 12. File → responsibility quick map

| Path | Responsibility |
|------|----------------|
| `packages/engine/src/coverage.ts` | `effectiveQuality`, satisfaction, tier |
| `packages/engine/src/stateEngine.ts` | `EngineInput`, `recomputeMissionStates`, gates |
| `packages/engine/src/planner.ts` | Candidate generation, sandbox eval, ranking |
| `packages/engine/src/applyPlan.ts` | Commit validation |
| `packages/engine/src/monitor.ts` | `scanBelief`, salience gate helpers |
| `packages/engine/src/volume/*` | AREA patrol discretization + sweep |
| `packages/engine/src/routePlanner.ts` | Threat exposure/risk, no-go |
| `packages/db/src/missions.ts` | `buildEngineInputFromDb` |
| `apps/orchestrator/src/tick.ts` | Production tick wiring |
| `apps/orchestrator/src/scenario-run.ts` | Demo scenario replay |
| `apps/ui/src/App.tsx` | Operator console shell |
| `supabase/migrations/*.sql` | Schema contract (incremental) |

---

## 13. Glossary

| Term | Definition |
|------|------------|
| **Belief** | Everything the system knows about the fleet; never includes sim ground truth in engine |
| **Operating point** | Opaque speed/mode handle resolved to capacity + bearing via `OperatingPointResolver` |
| **Demand** | Graded per-sensor quality need (`task_demands`) |
| **Constraint** | Hard pass/fail gate (`task_constraints`) |
| **Disruption** | Monitor finding (comms loss, battery, stale belief, health) |
| **Salience** | `impact × urgency × confidence`; drives alert visibility |
| **Cascade** | Secondary mission coverage drop caused by a reassignment |
| **Volume visit** | Per-cell patrol memory for AREA tasks |
| **Planning override** | Hypothetical position for sandbox patrol eval only (never live tick) |

---

*Generated for the Mission Orchestrator monorepo (June 2026). Update this file when adding migrations, seams, or new task leaf kinds.*
