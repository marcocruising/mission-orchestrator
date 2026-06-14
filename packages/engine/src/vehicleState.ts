import type { Asset, Belief } from "./types.js";
import { getFact } from "./types.js";
import type { VehicleState } from "./coverage.js";
import { mToKm, zMToDepthM, type Position3 } from "./spatial.js";
import type { ResolvedOperatingPoint } from "./operatingPoint.js";

function factNum(belief: Belief, assetId: string, field: string, fallback: number): number {
  const v = getFact(belief, assetId, field)?.value;
  return typeof v === "number" ? v : fallback;
}

/** Build vehicle state from belief, optional sandbox position override, and resolved operating point. */
export function buildVehicleState(
  belief: Belief,
  asset: Asset,
  resolved: ResolvedOperatingPoint,
  positionOverride?: Position3
): VehicleState {
  if (positionOverride) {
    return {
      asset_id: asset.id,
      x_km: mToKm(positionOverride.x_m),
      y_km: mToKm(positionOverride.y_m),
      depth_m: zMToDepthM(positionOverride.z_m),
      z_m: positionOverride.z_m,
      speed_kn: resolved.speed_kn,
      top_speed_kn: asset.top_speed_kn,
      bearing_deg: resolved.bearing_deg,
      elevation_deg: resolved.elevation_deg,
    };
  }

  const zFact = getFact(belief, asset.id, "z_m");
  return {
    asset_id: asset.id,
    x_km: factNum(belief, asset.id, "x_km", 0),
    y_km: factNum(belief, asset.id, "y_km", 0),
    depth_m: factNum(belief, asset.id, "depth_m", 0),
    z_m: typeof zFact?.value === "number" ? zFact.value : undefined,
    speed_kn: resolved.speed_kn,
    top_speed_kn: asset.top_speed_kn,
    bearing_deg: resolved.bearing_deg,
    elevation_deg: resolved.elevation_deg,
  };
}
