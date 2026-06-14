import { useEffect, useState, useCallback } from "react";
import {
  supabase,
  tierColor,
  ownAssetSearchUncertainty,
  zMFromBeliefFields,
  type BeliefFact,
  type MissionStateRow,
  type PlanEvalRow,
  type AssetRow,
} from "./lib.js";

const NOW = () => Math.floor(Date.now() / 1000);

export function App() {
  const [facts, setFacts] = useState<BeliefFact[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [missions, setMissions] = useState<MissionStateRow[]>([]);
  const [plans, setPlans] = useState<PlanEvalRow[]>([]);
  const [now, setNow] = useState(NOW());
  const [offline, setOffline] = useState(!supabase);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [a, f, m, p] = await Promise.all([
      supabase.from("assets").select("id, top_speed_kn"),
      supabase.from("belief_facts").select("asset_id, field, value, ts"),
      supabase.from("mission_state").select("*").order("tick", { ascending: false }).limit(20),
      supabase.from("plan_eval").select("*").order("objective", { ascending: false }).limit(5),
    ]);
    setAssets(a.data ?? []);
    setFacts(f.data ?? []);
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
    setNow(NOW());
  }, []);

  useEffect(() => {
    refresh();
    if (!supabase) return;
    const channel = supabase
      .channel("orchestrator")
      .on("postgres_changes", { event: "*", schema: "public", table: "belief_facts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_state" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "plan_eval" }, refresh)
      .subscribe();
    const timer = setInterval(() => setNow(NOW()), 1000);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const factMap = (assetId: string) => {
    const m: Record<string, unknown> = {};
    for (const f of facts.filter((x) => x.asset_id === assetId)) m[f.field] = f.value;
    return m;
  };

  const lastContact = (assetId: string) => {
    const ts = facts.filter((f) => f.asset_id === assetId).map((f) => f.ts);
    return ts.length ? Math.max(...ts) : 0;
  };

  async function acceptPlan(planId: string) {
    if (!supabase) return;
    await fetch("/api/apply-plan", { method: "POST", body: JSON.stringify({ planId }) }).catch(() =>
      alert(`Accept plan ${planId} — wire to orchestrator API or run: orchestrator apply ${planId}`)
    );
    refresh();
  }

  return (
    <div className="layout">
      <header>
        <h1>Mission Orchestrator</h1>
        {offline && (
          <p className="banner">
            Demo mode — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env for Realtime
          </p>
        )}
      </header>

      <section className="map-panel">
        <h2>Fleet map</h2>
        <svg viewBox="-10 -10 20 20" className="map">
          {assets.map((a) => {
            const f = factMap(a.id);
            const x = Number(f.x_km ?? 0);
            const y = Number(f.y_km ?? 0);
            const z_m = zMFromBeliefFields({
              z_m: f.z_m,
              depth_m: f.depth_m,
            });
            const commsUp = f.comms_up !== false;
            const uncertainty = ownAssetSearchUncertainty(
              x,
              y,
              z_m,
              a.top_speed_kn,
              now,
              lastContact(a.id)
            );
            const region = uncertainty.region;
            const zLabel =
              z_m >= 0
                ? `alt ${z_m.toFixed(0)}±${uncertainty.z_sigma_m.toFixed(0)}m`
                : `depth ${(-z_m).toFixed(0)}±${uncertainty.z_sigma_m.toFixed(0)}m`;
            return (
              <g key={a.id} transform={`translate(${x}, ${-y})`}>
                {!commsUp && (
                  <ellipse
                    cx={0}
                    cy={0}
                    rx={region.semiMajor}
                    ry={region.semiMinor}
                    transform={`rotate(${(region.angleRad * 180) / Math.PI})`}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth={0.15}
                    opacity={0.7}
                  />
                )}
                <circle r={0.4} fill={commsUp ? "#38bdf8" : "#64748b"} />
                <text y={-0.7} textAnchor="middle" fontSize={0.5} fill="#e2e8f0">
                  {a.id}
                </text>
                {!commsUp && (
                  <text y={0.9} textAnchor="middle" fontSize={0.35} fill="#fb923c">
                    {zLabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </section>

      <section className="tiles">
        <h2>Missions</h2>
        {missions.length === 0 && <p className="muted">No mission_state rows yet — run orchestrator tick</p>}
        {missions.map((m) => (
          <div key={m.mission_id} className="tile" style={{ borderColor: tierColor(m.tier) }}>
            <strong>{m.mission_id}</strong>
            <span className="tier">{m.tier}</span>
            <div>Coverage {(m.cov_now * 100).toFixed(0)}%</div>
            <div>Confidence {(m.confidence * 100).toFixed(0)}%</div>
            <div>Salience {m.salience.toFixed(2)}</div>
          </div>
        ))}
      </section>

      <section className="plans">
        <h2>Recommendations</h2>
        {plans.map((p) => (
          <div key={p.plan_id} className="plan-card">
            <strong>{p.plan_id}</strong> — objective {p.objective.toFixed(3)}
            <ul>
              {Object.entries(p.cov_by_mission).map(([id, cov]) => (
                <li key={id}>
                  {id}: {(cov * 100).toFixed(0)}% cov
                </li>
              ))}
            </ul>
            {p.cascades.length > 0 && (
              <div className="cascade">
                Cascades: {p.cascades.map((c) => `${c.mission_id} ${(c.delta * 100).toFixed(0)}%`).join(", ")}
              </div>
            )}
            <div className="assumptions">{p.assumptions.join(" · ")}</div>
            <button type="button" onClick={() => acceptPlan(p.plan_id)}>
              Accept
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
