import {
  MAP_SIZE_KM,
  OIL_RIG,
  kmToPlanSvg,
  aabbKmFromFootprint,
  cellCentersKm,
  domainColor,
  assetDisplayName,
  assetLinkUp,
  factMapForAsset,
  lastContactTs,
  ownAssetSearchUncertainty,
  zMFromBeliefFields,
  formatDuration,
  type EnvironmentContext,
  type AssetRow,
  type BeliefFact,
  type TaskRow,
  type VolumeVisitRow,
} from "./lib.js";

interface PlanViewProps {
  assets: AssetRow[];
  facts: BeliefFact[];
  tasks: TaskRow[];
  visits: VolumeVisitRow[];
  simNow: number;
  environmentContext?: EnvironmentContext;
  selectedAssetId: string | null;
  onSelectAsset: (id: string) => void;
}

function chevronPoints(headingDeg: number): string {
  return `0,-7 6,7 0,3 -6,7`;
}

export function PlanView({
  assets,
  facts,
  tasks,
  visits,
  simNow,
  environmentContext,
  selectedAssetId,
  onSelectAsset,
}: PlanViewProps) {
  const visitSet = new Set(visits.map((v) => `${v.task_id}:${v.cell_id}`));
  const rig = kmToPlanSvg(OIL_RIG.x_km, OIL_RIG.y_km);

  return (
    <div className="view">
      <div className="view-h">
        Plan view · <b>offshore sector</b>
      </div>
      <div className="legend">
        <span>
          <i style={{ background: "var(--air)" }} />UAV
        </span>
        <span>
          <i style={{ background: "var(--surf)" }} />USV
        </span>
        <span>
          <i style={{ background: "var(--sub)" }} />UUV
        </span>
        <span>
          <i style={{ background: "var(--lost)" }} />rig
        </span>
      </div>
      <svg viewBox="0 0 560 340" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#0f1c26" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="560" height="340" fill="url(#grid)" />

        <rect
          x={60}
          y={40}
          width={440}
          height={260}
          rx={6}
          fill="none"
          stroke="#23414f"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        <text x={70} y={56} className="mono" fill="#39596b" fontSize={10}>
          OPERATING AREA · {MAP_SIZE_KM}×{MAP_SIZE_KM} km
        </text>

        {tasks
          .filter((t) => t.kind === "AREA")
          .map((task) => {
            const box = aabbKmFromFootprint(task.footprint);
            if (!box) return null;
            const tl = kmToPlanSvg(box.x0, box.y1);
            const br = kmToPlanSvg(box.x1, box.y0);
            const isSubsea = (task.z_min_m ?? 0) < -10;
            const w = br.x - tl.x;
            const h = br.y - tl.y;
            return (
              <g key={task.id}>
                <rect
                  x={tl.x}
                  y={tl.y}
                  width={w}
                  height={h}
                  fill={isSubsea ? "rgba(95,116,230,.08)" : "rgba(56,194,176,.06)"}
                  stroke={isSubsea ? "#5f74e6" : "#38c2b0"}
                  strokeWidth={1}
                  strokeDasharray={isSubsea ? "4 3" : undefined}
                  opacity={0.9}
                />
                {cellCentersKm(task).map((cell) => {
                  const p = kmToPlanSvg(cell.x_km, cell.y_km);
                  const visited = visitSet.has(`${task.id}:${cell.cell_id}`);
                  const cellW = (w / Math.max(1, Math.round((box.x1 - box.x0) / 2))) * 0.85;
                  return (
                    <rect
                      key={cell.cell_id}
                      x={p.x - cellW / 2}
                      y={p.y - cellW / 2}
                      width={cellW}
                      height={cellW}
                      fill={visited ? "rgba(52,181,138,.45)" : "rgba(21,35,48,.4)"}
                      stroke="#1c2c38"
                      strokeWidth={0.5}
                    />
                  );
                })}
              </g>
            );
          })}

        {(() => {
          const pipeline = tasks.find((t) => t.id === "task-pipeline-surface");
          const box = pipeline ? aabbKmFromFootprint(pipeline.footprint) : null;
          if (!box) return null;
          const a = kmToPlanSvg(box.x0, box.y0 + (box.y1 - box.y0) / 2);
          const b = kmToPlanSvg(box.x1, box.y0 + (box.y1 - box.y0) / 2);
          return (
            <g>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#4a5a2f" strokeWidth={3} />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#6f8a3f"
                strokeWidth={1}
                strokeDasharray="2 6"
              />
              <text
                x={(a.x + b.x) / 2}
                y={a.y + 18}
                className="mono"
                fill="#6f8a3f"
                fontSize={9.5}
                textAnchor="middle"
              >
                PIPELINE CORRIDOR
              </text>
            </g>
          );
        })()}

        <g transform={`translate(${rig.x}, ${rig.y})`}>
          <polygon points="0,-8 -6,6 6,6" fill="#e0a93a" stroke="#c9942a" strokeWidth={0.8} />
          <text y={16} className="mono" fill="#e0a93a" fontSize={9} textAnchor="middle">
            ALPHA RIG
          </text>
        </g>

        {assets.map((a) => {
          const f = factMapForAsset(facts, a.id);
          const x = Number(f.x_km ?? 0);
          const y = Number(f.y_km ?? 0);
          const z_m = zMFromBeliefFields({ z_m: f.z_m, depth_m: f.depth_m });
          const heading = Number(f.heading_deg ?? 0);
          const linkUp = assetLinkUp(facts, a.id, simNow);
          const lc = lastContactTs(facts, a.id);
          const color = domainColor(a.kind);
          const pos = kmToPlanSvg(x, y);
          const uncertainty = ownAssetSearchUncertainty(
            x,
            y,
            z_m,
            a.top_speed_kn,
            simNow,
            lc,
            2,
            0.4,
            undefined,
            environmentContext
          );
          const region = uncertainty.region;
          const scaleX = 440 / MAP_SIZE_KM;
          const scaleY = 260 / MAP_SIZE_KM;
          const rx = region.semiMajor * scaleX;
          const ry = region.semiMinor * scaleY;
          const silent = lc > 0 ? simNow - lc : 0;
          const label = assetDisplayName(a.id).split(" ").slice(-2).join("-").toUpperCase();

          return (
            <g
              key={a.id}
              opacity={linkUp ? 1 : 0.85}
              style={{ cursor: "pointer" }}
              onClick={() => onSelectAsset(a.id)}
            >
              {!linkUp && rx > 2 && (
                <g>
                  <ellipse
                    className="search-ellipse-pulse"
                    cx={pos.x}
                    cy={pos.y}
                    rx={rx}
                    ry={ry}
                    transform={`rotate(${(region.angleRad * 180) / Math.PI} ${pos.x} ${pos.y})`}
                    fill={`${color}18`}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  {silent > 0 && (
                    <text
                      x={pos.x}
                      y={pos.y - ry - 8}
                      className="mono"
                      fill={color}
                      fontSize={9}
                      textAnchor="middle"
                    >
                      SEARCH · {formatDuration(silent)} silent
                    </text>
                  )}
                </g>
              )}
              <g transform={`translate(${pos.x}, ${pos.y})`}>
                {linkUp ? (
                  <polygon
                    points={chevronPoints(heading)}
                    fill={color}
                    transform={`rotate(${heading})`}
                    stroke={selectedAssetId === a.id ? "#3fb6c9" : "none"}
                    strokeWidth={selectedAssetId === a.id ? 1.5 : 0}
                  />
                ) : (
                  <circle r={5} fill={`${color}88`} stroke={color} strokeWidth={1} />
                )}
              </g>
              <text
                x={pos.x}
                y={pos.y + (linkUp ? 18 : 16)}
                className="mono"
                fill={color}
                fontSize={8.5}
                textAnchor="middle"
              >
                {label}
              </text>
            </g>
          );
        })}

        <text x={514} y={58} className="mono" fill="#39596b" fontSize={11} textAnchor="middle">
          N↑
        </text>
        <line x1={430} y1={312} x2={490} y2={312} stroke="#39596b" strokeWidth={1} />
        <text x={460} y={324} className="mono" fill="#39596b" fontSize={9} textAnchor="middle">
          5 km
        </text>
      </svg>
    </div>
  );
}
