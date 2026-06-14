import { covToEllipse, zUncertainty, type UncertaintyRegion } from "./estimate.js";
import { StateLayout, kmToM, M_PER_KM } from "./spatial.js";

/** Knots → m/s (1 kn = 1852 m / 3600 s). */
const KNOTS_TO_M_S = 1852 / 3600;

/** Unified own-asset reachable-set uncertainty (horizontal ellipse + vertical σ). */
export interface SearchUncertainty {
  region: UncertaintyRegion;
  z_m: number;
  z_sigma_m: number;
}

function buildReachableCov6(
  vMaxKn: number,
  dtSeconds: number,
  k: number,
  minorAxisRatio: number
): number[][] {
  const dtHours = dtSeconds / 3600;
  const semiMajorKm = vMaxKn * dtHours;
  const semiMinorKm = semiMajorKm * minorAxisRatio;
  const lambdaMajorM2 = (semiMajorKm * M_PER_KM / k) ** 2;
  const lambdaMinorM2 = (semiMinorKm * M_PER_KM / k) ** 2;
  const vMaxMs = vMaxKn * KNOTS_TO_M_S;
  const zSigmaM = Math.max(vMaxMs * dtSeconds / k, 1);
  const velVar = 1e-6;
  const cov = Array.from({ length: 6 }, () => Array(6).fill(0));
  cov[StateLayout.X][StateLayout.X] = lambdaMajorM2;
  cov[StateLayout.Y][StateLayout.Y] = lambdaMinorM2;
  cov[StateLayout.Z][StateLayout.Z] = zSigmaM * zSigmaM;
  cov[StateLayout.VX][StateLayout.VX] = velVar;
  cov[StateLayout.VY][StateLayout.VY] = velVar;
  cov[StateLayout.VZ][StateLayout.VZ] = velVar;
  return cov;
}

/**
 * Own-asset search uncertainty when contact is lost — full 6D reachable set projected
 * to horizontal ellipse + z σ (same renderer path as external track estimates).
 */
export function ownAssetSearchUncertainty(
  x_km: number,
  y_km: number,
  z_m: number,
  vMaxKn: number,
  now: number,
  lastContactTs: number,
  k = 2,
  minorAxisRatio = 0.4
): SearchUncertainty {
  const dtSeconds = Math.max(0, now - lastContactTs);
  const cov = buildReachableCov6(vMaxKn, dtSeconds, k, minorAxisRatio);
  const mean = [kmToM(x_km), kmToM(y_km), z_m, 0, 0, 0];
  const region = covToEllipse(cov, mean, k);
  const z = zUncertainty(mean, cov);
  return { region, z_m: z.z_m, z_sigma_m: z.sigma_m };
}

/**
 * Horizontal map ellipse only — prefer ownAssetSearchUncertainty when z display matters.
 */
export function ownAssetSearchRegion(
  x_km: number,
  y_km: number,
  z_m: number,
  vMaxKn: number,
  now: number,
  lastContactTs: number,
  k = 2,
  minorAxisRatio = 0.4
): UncertaintyRegion {
  return ownAssetSearchUncertainty(
    x_km,
    y_km,
    z_m,
    vMaxKn,
    now,
    lastContactTs,
    k,
    minorAxisRatio
  ).region;
}

/** Legacy scalar helper — semiMajor from unified region (backward compat for tests). */
export function searchEllipseSemiMajor(vMaxKn: number, now: number, lastContactTs: number): number {
  return ownAssetSearchRegion(0, 0, 0, vMaxKn, now, lastContactTs).semiMajor;
}

/** Resolve signed z_m from belief facts — prefers z_m, else depth_m adapter. */
export function zMFromBeliefFields(fields: { z_m?: unknown; depth_m?: unknown }): number {
  if (typeof fields.z_m === "number") return fields.z_m;
  if (typeof fields.depth_m === "number") return -fields.depth_m;
  return 0;
}
