import {
  OIL_RIG,
  SEAFLOOR_Z_M,
  kmToPlanSvg,
  zToProfileY,
  domainColor,
  assetDisplayName,
  assetLinkUp,
  factMapForAsset,
  zMFromBeliefFields,
  type AssetRow,
  type BeliefFact,
  type TaskRow,
} from "./lib.js";

interface ProfileViewProps {
  assets: AssetRow[];
  facts: BeliefFact[];
  tasks: TaskRow[];
  simNow: number;
  selectedAssetId: string | null;
}

export function ProfileView({ assets, facts, tasks, simNow, selectedAssetId }: ProfileViewProps) {
  const pipeline = tasks.find((t) => t.id === "task-pipeline-subsea");
  const rigX = kmToPlanSvg(OIL_RIG.x_km, OIL_RIG.y_km).x;

  let pipelineLine: { x1: number; x2: number; y: number } | null = null;
  if (pipeline) {
    const fp = pipeline.footprint as { center_x_km?: number; half_width_km?: number } | null;
    if (fp?.center_x_km != null && fp.half_width_km != null) {
      const a = kmToPlanSvg(fp.center_x_km - fp.half_width_km, OIL_RIG.y_km);
      const b = kmToPlanSvg(fp.center_x_km + fp.half_width_km, OIL_RIG.y_km);
      pipelineLine = { x1: a.x, x2: b.x, y: zToProfileY(SEAFLOOR_Z_M + 5) };
    }
  }

  return (
    <div className="view">
      <div className="view-h">
        Profile · <b>water column</b> (signed z, up +)
      </div>
      <svg viewBox="0 0 560 168" preserveAspectRatio="none">
        <defs>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0c2733" />
            <stop offset="1" stopColor="#061018" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={560} height={40} fill="#0a1822" />
        <text x={10} y={15} className="mono" fill="#39596b" fontSize={9}>
          AIR +2000 m
        </text>
        <rect x={0} y={40} width={560} height={2} fill="var(--surf)" opacity={0.7} />
        <text x={512} y={38} className="mono" fill="var(--surf)" fontSize={9} textAnchor="end">
          SURFACE 0 m
        </text>
        <rect x={0} y={42} width={560} height={112} fill="url(#water)" />
        <rect x={0} y={154} width={560} height={14} fill="#13140d" />
        <text x={10} y={165} className="mono" fill="#4a5a2f" fontSize={9}>
          SEABED {SEAFLOOR_Z_M} m
        </text>
        <text x={512} y={100} className="mono" fill="#2e4b58" fontSize={9} textAnchor="end">
          −50 m
        </text>

        {pipelineLine && (
          <g>
            <line
              x1={pipelineLine.x1}
              y1={pipelineLine.y}
              x2={pipelineLine.x2}
              y2={pipelineLine.y}
              stroke="#6f8a3f"
              strokeWidth={2}
            />
            <text
              x={(pipelineLine.x1 + pipelineLine.x2) / 2}
              y={pipelineLine.y - 4}
              className="mono"
              fill="#6f8a3f"
              fontSize={8}
              textAnchor="middle"
            >
              PIPELINE {SEAFLOOR_Z_M + 5} m
            </text>
          </g>
        )}

        <g transform={`translate(${rigX}, ${zToProfileY(0)})`}>
          <rect x={-4} y={-3} width={9} height={7} fill="#e0a93a" />
          <text y={-8} className="mono" fill="#e0a93a" fontSize={8} textAnchor="middle">
            RIG 0
          </text>
        </g>

        {assets.map((a) => {
          const f = factMapForAsset(facts, a.id);
          const x = kmToPlanSvg(Number(f.x_km ?? 0), Number(f.y_km ?? 0)).x;
          const z_m = zMFromBeliefFields({ z_m: f.z_m, depth_m: f.depth_m });
          const y = zToProfileY(z_m);
          const color = domainColor(a.kind);
          const linkUp = assetLinkUp(facts, a.id, simNow);
          const label = assetDisplayName(a.id).split(" ").slice(-2).join("-").toUpperCase();
          const selected = selectedAssetId === a.id;

          return (
            <g key={a.id} opacity={linkUp ? 1 : 0.75}>
              {!linkUp && (
                <rect
                  x={x - 4}
                  y={y - 12}
                  width={8}
                  height={24}
                  fill={`${color}30`}
                  rx={2}
                />
              )}
              {z_m >= 0 && (
                <line
                  x1={x}
                  y1={y + 4}
                  x2={x}
                  y2={40}
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={selected ? 5.5 : 4.5}
                fill={color}
                stroke={selected ? "#3fb6c9" : "none"}
                strokeWidth={1.5}
              />
              <text
                x={x}
                y={y - (z_m >= 0 ? 10 : 8)}
                className="mono"
                fill={color}
                fontSize={8}
                textAnchor="middle"
              >
                {label} {Math.round(z_m)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
