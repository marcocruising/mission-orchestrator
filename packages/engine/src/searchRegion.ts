import { covToEllipse, zUncertainty, type UncertaintyRegion } from "./estimate.js";
import { kmToM, M_PER_KM } from "./spatial.js";
import type { EnvironmentContext } from "./environmentContext.js";
import {
  defaultConstantVelocityModel,
  initialLostContactState,
  propagateState,
  type MotionModel,
} from "./motionModel.js";

/** Knots → m/s (1 kn = 1852 m / 3600 s). */
export const KNOTS_TO_M_S = 1852 / 3600;

/** Unified own-asset reachable-set uncertainty (horizontal ellipse + vertical σ). */
export interface SearchUncertainty {
  region: UncertaintyRegion;
  z_m: number;
  z_sigma_m: number;
}

function horizontalCovWithAspect(
  propagated: number[][],
  minorAxisRatio: number
): number[][] {
  const cov = propagated.map((row) => [...row]);
  const xyMean = (cov[0][0] + cov[1][1]) / 2;
  cov[0][0] = xyMean;
  cov[1][1] = xyMean * minorAxisRatio * minorAxisRatio;
  cov[0][1] = 0;
  cov[1][0] = 0;
  return cov;
}

/**
 * Own-asset search uncertainty when contact is lost — 6D reachable set via MotionModel,
 * projected to horizontal ellipse + z σ (same renderer path as external track estimates).
 */
export function ownAssetSearchUncertainty(
  x_km: number,
  y_km: number,
  z_m: number,
  vMaxKn: number,
  now: number,
  lastContactTs: number,
  k = 2,
  minorAxisRatio = 0.4,
  motionModel: MotionModel = defaultConstantVelocityModel,
  environment?: EnvironmentContext
): SearchUncertainty {
  const dtSeconds = Math.max(0, now - lastContactTs);
  const vMaxMs = vMaxKn * KNOTS_TO_M_S;
  const initial = initialLostContactState(kmToM(x_km), kmToM(y_km), z_m, vMaxMs);
  const propagated = propagateState(initial.mean, initial.cov, dtSeconds, motionModel, environment);
  const displayCov = horizontalCovWithAspect(propagated.cov, minorAxisRatio);
  const region = covToEllipse(displayCov, propagated.mean, k);
  const z = zUncertainty(propagated.mean, propagated.cov);
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
  minorAxisRatio = 0.4,
  motionModel?: MotionModel,
  environment?: EnvironmentContext
): UncertaintyRegion {
  return ownAssetSearchUncertainty(
    x_km,
    y_km,
    z_m,
    vMaxKn,
    now,
    lastContactTs,
    k,
    minorAxisRatio,
    motionModel,
    environment
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

/** Approximate horizontal reach in km (v_max · Δt) — display helper only. */
export function horizontalReachKm(vMaxKn: number, dtSeconds: number): number {
  return vMaxKn * (dtSeconds / 3600);
}

export { M_PER_KM };
