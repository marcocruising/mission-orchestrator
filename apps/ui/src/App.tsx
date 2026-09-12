import { useCallback, useEffect, useMemo, useState } from "react";
import { PlanView } from "./PlanView.js";
import { ProfileView } from "./ProfileView.js";
import {
  supabase,
  SCENARIO_MAX_TICK,
  cssVar,
  tierCss,
  domainCss,
  formatZ,
  formatClockTs,
  formatPlanMove,
  assetDisplayName,
  missionShortName,
  factMapForAsset,
  assetStatus,
  sensorEffectiveQuality,
  sensorLabel,
  parseOperatingPoint,
  tierFromCov,
  environmentContextFromDbRows,
  type EnvSampleDbRow,
  type EnvironmentContext,
  type AssetRow,
  type BeliefFact,
  type MissionRow,
  type MissionStateRow,
  type PlanEvalRow,
  type CandidatePlanRow,
  type AlertRow,
  type TaskRow,
  type VolumeVisitRow,
  type AssetSensorRow,
  type AssignmentRow,
  type DecisionLogRow,
  zMFromBeliefFields,
} from "./lib.js";
import {
  DEMO_ALERTS,
  DEMO_ASSETS,
  DEMO_ASSIGNMENTS,
  DEMO_CANDIDATES,
  DEMO_FACTS,
  DEMO_MISSIONS,
  DEMO_MISSION_DEFS,
  DEMO_PLANS,
  DEMO_SENSORS,
  DEMO_TASKS,
  DEMO_TICK_LABELS,
  DEMO_VISITS,
  isDemoMode,
} from "./demoFixture.js";

interface ScenarioTick {
  tick: number;
  label: string;
}

const OPTION_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function App() {
  const [facts, setFacts] = useState<BeliefFact[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [missionDefs, setMissionDefs] = useState<MissionRow[]>([]);
  const [missions, setMissions] = useState<MissionStateRow[]>([]);
  const [plans, setPlans] = useState<PlanEvalRow[]>([]);
  const [candidates, setCandidates] = useState<CandidatePlanRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [visits, setVisits] = useState<VolumeVisitRow[]>([]);
  const [sensors, setSensors] = useState<AssetSensorRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [decisions, setDecisions] = useState<DecisionLogRow[]>([]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [offline, setOffline] = useState(!supabase);
  const [currentTick, setCurrentTick] = useState(-1);
  const [tickLabels, setTickLabels] = useState<ScenarioTick[]>([]);
  const [apiReady, setApiReady] = useState(false);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [sliderTick, setSliderTick] = useState(0);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [environmentContext, setEnvironmentContext] = useState<EnvironmentContext | undefined>();

  const simNow = facts.length > 0 ? Math.max(...facts.map((f) => f.ts)) : now;
  const baseTs = facts.length > 0 ? Math.min(...facts.map((f) => f.ts)) : simNow;

  const missionNames = useMemo(
    () => new Map(missionDefs.map((m) => [m.id, m.name])),
    [missionDefs]
  );
  const assetNames = useMemo(
    () => new Map(assets.map((a) => [a.id, assetDisplayName(a.id)])),
    [assets]
  );
  const taskLabels = useMemo(
    () =>
      new Map(
        tasks.map((t) => [
          t.id,
          t.id.replace("task-", "").replace(/-/g, " "),
        ])
      ),
    [tasks]
  );

  const refresh = useCallback(async () => {
    if (isDemoMode() || !supabase) return;
    const [a, f, md, m, p, cp, al, t, v, sn, asn, dec, env] = await Promise.all([
      supabase.from("assets").select("id, kind, domain, top_speed_kn"),
      supabase.from("belief_facts").select("asset_id, field, value, ts"),
      supabase.from("missions").select("id, name"),
      supabase.from("mission_state").select("*").order("tick", { ascending: false }).limit(30),
      supabase.from("plan_eval").select("*").order("objective", { ascending: false }).limit(8),
      supabase.from("candidate_plans").select("plan_id, moves, n_moves"),
      supabase.from("alert_log").select("*").order("ts", { ascending: false }).limit(20),
      supabase
        .from("tasks")
        .select(
          "id, mission_id, kind, target_x, target_y, target_depth_m, footprint, z_min_m, z_max_m, cell_size_m"
        ),
      supabase.from("task_volume_visits").select("task_id, cell_id, peak_quality"),
      supabase.from("asset_sensors").select("asset_id, sensor, base_quality, max_range_km, k_motion, beam_half_angle_deg"),
      supabase.from("assignments").select("asset_id, task_id, operating_point"),
      supabase.from("decision_log").select("ts, chosen_plan_id, operator").order("ts", { ascending: false }).limit(10),
      supabase.from("environment_samples").select("ts, kind, x_km, y_km, depth_m, value"),
    ]);

    setAssets((a.data ?? []) as AssetRow[]);
    setFacts(f.data ?? []);
    setMissionDefs((md.data ?? []) as MissionRow[]);
    setMissions(
      (m.data ?? []).filter(
        (row, i, arr) => arr.findIndex((x) => x.mission_id === row.mission_id) === i
      ) as MissionStateRow[]
    );
    setPlans(
      (p.data ?? []).map((row) => ({
        plan_id: row.plan_id,
        objective: Number(row.objective),
        cov_by_mission: row.cov_by_mission as Record<string, number>,
        cascades: row.cascades as PlanEvalRow["cascades"],
        assumptions: row.assumptions as string[],
      }))
    );
    setCandidates(
      (cp.data ?? []).map((row) => ({
        plan_id: row.plan_id,
        moves: row.moves as CandidatePlanRow["moves"],
        n_moves: row.n_moves,
      }))
    );
    setAlerts((al.data ?? []) as AlertRow[]);
    setTasks((t.data ?? []) as TaskRow[]);
    setVisits((v.data ?? []) as VolumeVisitRow[]);
    setSensors((sn.data ?? []) as AssetSensorRow[]);
    setAssignments((asn.data ?? []) as AssignmentRow[]);
    setDecisions((dec.data ?? []) as DecisionLogRow[]);
    const tick = f.data?.length ? Math.max(...f.data.map((row) => Number(row.ts))) : 0;
    setEnvironmentContext(
      environmentContextFromDbRows((env.data ?? []) as EnvSampleDbRow[], tick)
    );
    setNow(Math.floor(Date.now() / 1000));
  }, []);

  useEffect(() => {
    if (isDemoMode()) {
      setAssets(DEMO_ASSETS);
      setFacts(DEMO_FACTS);
      setMissionDefs(DEMO_MISSION_DEFS);
      setMissions(DEMO_MISSIONS);
      setPlans(DEMO_PLANS);
      setCandidates(DEMO_CANDIDATES);
      setAlerts(DEMO_ALERTS);
      setTasks(DEMO_TASKS);
      setVisits(DEMO_VISITS);
      setSensors(DEMO_SENSORS);
      setAssignments(DEMO_ASSIGNMENTS);
      setTickLabels(DEMO_TICK_LABELS);
      setCurrentTick(4);
      setSliderTick(4);
      setApiReady(true);
      setOffline(false);
      return;
    }
    refresh();
    if (!supabase) return;
    const channel = supabase
      .channel("orchestrator")
      .on("postgres_changes", { event: "*", schema: "public", table: "belief_facts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_state" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_eval" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "alert_log" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_volume_visits" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "environment_samples" }, refresh)
      .subscribe();
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    if (isDemoMode()) return;
    fetch("/api/scenario")
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error((data as { error?: string } | null)?.error ?? r.statusText);
        return data;
      })
      .then((data) => {
        if (!data) return;
        setApiReady(true);
        setTickLabels(data.ticks ?? []);
        if (typeof data.currentTick === "number") setCurrentTick(data.currentTick);
      })
      .catch(() => {
        setApiReady(false);
        setScenarioError(
          "Tick controls need pnpm --filter @mission-orchestrator/ui dev"
        );
      });
  }, []);

  useEffect(() => {
    if (missions.length === 0) return;
    const maxTick = Math.max(...missions.map((m) => m.tick));
    setCurrentTick((prev) => (maxTick > prev ? maxTick : prev));
  }, [missions]);

  useEffect(() => {
    setSliderTick(Math.max(0, currentTick));
  }, [currentTick]);

  async function runScenario(
    path: string,
    body?: Record<string, unknown>
  ): Promise<void> {
    setScenarioBusy(true);
    setScenarioError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if (typeof data.tick === "number") setCurrentTick(data.tick);
      await refresh();
    } catch (err) {
      setScenarioError(err instanceof Error ? err.message : String(err));
    } finally {
      setScenarioBusy(false);
    }
  }

  async function acceptPlan(planId: string) {
    const res = await fetch("/api/apply-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, tick: currentTick }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert((data as { error?: string }).error ?? `Failed to apply ${planId}`);
      return;
    }
    await refresh();
  }

  function selectAsset(id: string) {
    setSelectedAssetId(id);
    setDrawerOpen(true);
  }

  const shownAlerts = alerts.filter((a) => a.shown);
  const topAlert = shownAlerts[0];
  const candidateMap = new Map(candidates.map((c) => [c.plan_id, c]));
  const tickLabel =
    tickLabels.find((t) => t.tick === currentTick)?.label ??
    (currentTick < 0 ? "Ready — advance to tick 0" : `Tick ${currentTick}`);

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);
  const selectedFacts = selectedAsset ? factMapForAsset(facts, selectedAsset.id) : {};
  const selectedAssignment = assignments.find((a) => a.asset_id === selectedAssetId);
  const selectedTask = tasks.find((t) => t.id === selectedAssignment?.task_id);
  const selectedSensors = sensors.filter((s) => s.asset_id === selectedAssetId);
  const currentOp = selectedAssignment
    ? parseOperatingPoint(String(selectedAssignment.operating_point))
    : "STATION";

  const timelineEvents = useMemo(() => {
    const events: { ts: number; text: string; kind: "crit" | "act" | "norm" }[] = [];
    for (const a of shownAlerts) {
      events.push({
        ts: a.ts,
        text: a.summary_text ?? `${a.mission_id} alert · salience ${a.salience.toFixed(2)}`,
        kind: "crit",
      });
    }
    for (const d of decisions) {
      if (d.chosen_plan_id) {
        events.push({
          ts: d.ts,
          text: `Operator accepted ${d.chosen_plan_id}`,
          kind: "act",
        });
      }
    }
    return events.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [shownAlerts, decisions]);

  const scrubPct =
    SCENARIO_MAX_TICK > 0
      ? (Math.max(0, sliderTick) / SCENARIO_MAX_TICK) * 100
      : 0;

  return (
    <div className="app">
      {offline && (
        <div className="offline-banner">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env for live data
        </div>
      )}

      <header className="header">
        <div className="brand">
          MISSION ORCHESTRATOR<span className="sub">operator console</span>
        </div>
        <div className="clock">
          <span>
            T+ <b>{formatClockTs(simNow, baseTs)}</b>
          </span>
          <span>
            tick <b>{currentTick < 0 ? "—" : currentTick}</b>
          </span>
          <span>offshore pipeline · 20×20 km</span>
        </div>

        <div className="health">
          {missions.map((m) => (
            <div key={m.mission_id} className="pill">
              <div className="top">
                <span className="nm">{missionShortName(m.mission_id, missionNames)}</span>
                <span className="cov" style={{ color: tierCss(m.tier) }}>
                  {Math.round(m.cov_now * 100)}%
                </span>
              </div>
              <div className="track">
                <div
                  className="fill"
                  style={{
                    width: `${m.cov_now * 100}%`,
                    background: tierCss(m.tier),
                  }}
                />
              </div>
              <div className="meta">
                <span>{m.tier.replace("_", "-")}</span>
                <span title="confidence">
                  conf{" "}
                  <span className={`conf-dot ${m.confidence < 0.6 ? "lo" : "hi"}`} />
                </span>
              </div>
            </div>
          ))}
        </div>

        <button className="bell" type="button" title="Active alerts">
          ⚑
          {shownAlerts.length > 0 && (
            <span className="badge">{shownAlerts.length}</span>
          )}
        </button>
      </header>

      <aside className="fleet">
        <div className="rail-h">Fleet · {assets.length} assets</div>
        {assets.map((a) => {
          const f = factMapForAsset(facts, a.id);
          const z_m = zMFromBeliefFields({ z_m: f.z_m, depth_m: f.depth_m });
          const { status, text } = assetStatus(facts, a.id, simNow);
          const batt = Number(f.battery_pct ?? 100) / 100;
          const speed = Number(f.speed_kn ?? 0);
          const dc = domainCss(a.kind);
          return (
            <button
              key={a.id}
              type="button"
              className={`asset${selectedAssetId === a.id ? " sel" : ""}`}
              style={{ ["--dc" as string]: cssVar(dc) }}
              onClick={() => selectAsset(a.id)}
            >
              <div className="l1">
                <span className="nm">
                  <span className="kind" style={{ ["--dc" as string]: cssVar(dc) }}>
                    {a.kind}
                  </span>
                  {assetDisplayName(a.id)}
                </span>
                <span className={`stat ${status}`}>{text}</span>
              </div>
              <div className="l2">
                <span className="z">z {formatZ(z_m)}</span>
                <span>{speed.toFixed(0)} kn</span>
                <span className="batt">
                  <i
                    style={{
                      width: `${batt * 100}%`,
                      background: batt < 0.5 ? cssVar("--degraded") : cssVar("--full"),
                    }}
                  />
                </span>
              </div>
            </button>
          );
        })}

        <div className="rail-h" style={{ marginTop: 14 }}>
          Contacts · 0 tracks
        </div>
        <div className="rail-empty">No external contacts in scenario</div>
      </aside>

      <section className="stage">
        <PlanView
          assets={assets}
          facts={facts}
          tasks={tasks}
          visits={visits}
          simNow={simNow}
          environmentContext={environmentContext}
          selectedAssetId={selectedAssetId}
          onSelectAsset={selectAsset}
        />
        <ProfileView
          assets={assets}
          facts={facts}
          tasks={tasks}
          simNow={simNow}
          selectedAssetId={selectedAssetId}
        />
      </section>

      <aside className="decision">
        {topAlert ? (
          <div className="alert">
            <div className="ah">
              <span className="dotpulse" />
              <span className="ttl">
                {missionShortName(topAlert.mission_id, missionNames)} at risk
              </span>
              <span className="sev">salience {Number(topAlert.salience).toFixed(2)}</span>
            </div>
            <div
              className="body"
              dangerouslySetInnerHTML={{
                __html: topAlert.summary_text
                  ? topAlert.summary_text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
                  : `<b>${topAlert.tier_change ?? "Tier change"}</b> — coverage shift detected.`,
              }}
            />
          </div>
        ) : (
          <div className="decision-empty">
            {currentTick < 4
              ? "Advance to tick 4 — UUV comms loss triggers alerts and recommendations."
              : "No alerts above the salience gate."}
          </div>
        )}

        <div className="rec-h">
          <span className="k">Recommendations</span>
          <span className="ct">
            {plans.length} option{plans.length === 1 ? "" : "s"} · simulated
          </span>
        </div>

        {plans.length === 0 && (
          <div className="decision-empty">
            Plans appear after a salience-gated disruption (try tick 4+).
          </div>
        )}

        {plans.map((p, i) => {
          const cand = candidateMap.get(p.plan_id);
          const moves = cand?.moves ?? [];
          const isBest = i === 0;
          const opt = OPTION_LABELS[i] ?? String(i + 1);
          const moveText = formatPlanMove(moves, assetNames, taskLabels);
          const isDoNothing = moves.length === 0;

          return (
            <div key={p.plan_id} className={`card${isBest ? " best" : ""}`}>
              <div className="ch">
                <span className="opt">OPTION {opt}</span>
                {isBest && <span className="tag">recommended</span>}
              </div>
              <div className="move">{moveText}</div>
              <div className="deltas">
                {Object.entries(p.cov_by_mission).map(([mid, cov]) => {
                  const tName = tierFromCov(cov);
                  return (
                    <div key={mid} className="delta">
                      <span className="nm">{missionShortName(mid, missionNames)}</span>
                      <span className="bar">
                        <i
                          style={{
                            width: `${cov * 100}%`,
                            background: tierCss(tName),
                          }}
                        />
                      </span>
                      <span className="v">
                        {Math.round(cov * 100)}% <small>{tName.replace("_", "-")}</small>
                      </span>
                    </div>
                  );
                })}
              </div>
              {p.cascades.length > 0 && (
                <div className="cascade">
                  ⤷ cascade ·{" "}
                  {p.cascades
                    .map(
                      (c) =>
                        `${missionShortName(c.mission_id, missionNames)} ${c.delta >= 0 ? "+" : ""}${(c.delta * 100).toFixed(0)}%`
                    )
                    .join("; ")}
                </div>
              )}
              {p.assumptions.length > 0 && (
                <div className="assume">
                  <b>Assumes:</b> {p.assumptions.join(" · ")}
                </div>
              )}
              <div className="actions">
                <button
                  type="button"
                  className={`btn ${isBest ? "primary" : "ghost"}`}
                  onClick={() => acceptPlan(p.plan_id)}
                  disabled={!apiReady || scenarioBusy}
                >
                  {isDoNothing ? "Acknowledge" : "Accept & commit"}
                </button>
              </div>
            </div>
          );
        })}
      </aside>

      <footer className="timeline">
        <div className="scrub">
          <div className="lab">Timeline · scenario scrub</div>
          <div className="tick-label">{tickLabel}</div>
          <div className="scrub-controls">
            <button
              type="button"
              disabled={!apiReady || scenarioBusy || currentTick < 0}
              onClick={() =>
                runScenario("/api/tick/goto", { tick: Math.max(0, currentTick - 1) })
              }
            >
              ◀ Prev
            </button>
            <button
              type="button"
              disabled={!apiReady || scenarioBusy || currentTick >= SCENARIO_MAX_TICK}
              onClick={() => runScenario("/api/tick/next")}
            >
              Next ▶
            </button>
            <button
              type="button"
              disabled={!apiReady || scenarioBusy}
              onClick={() => runScenario("/api/reset")}
            >
              Reset
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={SCENARIO_MAX_TICK}
            step={1}
            value={sliderTick}
            disabled={!apiReady || scenarioBusy}
            onChange={(e) => setSliderTick(Number(e.target.value))}
            onMouseUp={() => {
              if (sliderTick !== currentTick)
                runScenario("/api/tick/goto", { tick: sliderTick });
            }}
            onTouchEnd={() => {
              if (sliderTick !== currentTick)
                runScenario("/api/tick/goto", { tick: sliderTick });
            }}
            style={{
              background: `linear-gradient(to right, var(--accent) ${scrubPct}%, #152330 ${scrubPct}%)`,
            }}
          />
          {scenarioError && <div className="scenario-error">{scenarioError}</div>}
        </div>

        <div className="feed">
          {timelineEvents.length === 0 && (
            <div className="ev">
              <span className="t">—</span>
              <span>Advance ticks to populate event feed</span>
            </div>
          )}
          {timelineEvents.map((ev, i) => (
            <div key={`${ev.ts}-${i}`} className={`ev${ev.kind === "crit" ? " crit" : ev.kind === "act" ? " act" : ""}`}>
              <span className="t">T+{formatClockTs(ev.ts, baseTs)}</span>
              <span>{ev.text}</span>
            </div>
          ))}
        </div>
      </footer>

      <div className={`drawer${drawerOpen && selectedAsset ? " open" : ""}`} id="drawer">
        {selectedAsset && (
          <>
            <div className="dh">
              <span
                className="kind"
                style={{ ["--dc" as string]: cssVar(domainCss(selectedAsset.kind)) }}
              >
                {selectedAsset.kind}
              </span>
              <span className="nm">{assetDisplayName(selectedAsset.id)}</span>
              <button
                type="button"
                className="close"
                onClick={() => {
                  setDrawerOpen(false);
                  setSelectedAssetId(null);
                }}
              >
                ✕
              </button>
            </div>
            <div
              className="meta"
              style={{ ["--dc2" as string]: cssVar(domainCss(selectedAsset.kind)) }}
            >
              <span className="z">
                z{" "}
                {formatZ(
                  zMFromBeliefFields({
                    z_m: selectedFacts.z_m,
                    depth_m: selectedFacts.depth_m,
                  })
                )}
              </span>
              <span>{selectedAsset.domain}</span>
              <span>{Number(selectedFacts.speed_kn ?? 0).toFixed(0)} kn</span>
              <span>batt {Math.round(Number(selectedFacts.battery_pct ?? 100))}%</span>
            </div>

            <div className="sec">Subsystem capacity · base vs effective now</div>
            {selectedSensors.map((s) => {
              const eff = sensorEffectiveQuality(s, selectedAsset, facts, selectedTask, environmentContext);
              return (
                <div key={s.sensor} className="sensor">
                  <div className="row">
                    <span className="nm">{sensorLabel(s.sensor)}</span>
                    <span className="v">
                      {eff.toFixed(2)} / {s.base_quality.toFixed(2)}
                    </span>
                  </div>
                  <div className="sbar">
                    <div className="base" style={{ width: `${s.base_quality * 100}%` }} />
                    <div className="eff" style={{ width: `${Math.min(eff, 1) * 100}%` }} />
                  </div>
                </div>
              );
            })}

            <div className="sec">Operating point</div>
            <div className="opsel">
              {(["STATION", "SLOW", "FAST"] as const).map((op) => (
                <button
                  key={op}
                  type="button"
                  className={currentOp === op ? "on" : ""}
                  disabled
                  title="Change via planner recommendations"
                >
                  {op}
                </button>
              ))}
            </div>

            <div className="sec">Current tasking</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
              {selectedTask
                ? `${selectedTask.id.replace("task-", "")} · ${selectedTask.kind}`
                : "Unassigned"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
