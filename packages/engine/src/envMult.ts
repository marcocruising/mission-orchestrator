import type { SensorSpec, VehicleState } from "./coverage.js";
import { salinityFactor } from "./envFactors/salinityFactor.js";
import { seaStateFactor } from "./envFactors/seaStateFactor.js";
import { fogFactor } from "./envFactors/fogFactor.js";
import { beamGainFactor } from "./envFactors/beamGainFactor.js";

/** Context passed to each environment multiplier factor. */
export interface EnvMultContext {
  sensor: SensorSpec;
  vehicle: VehicleState;
  environment?: import("./environmentContext.js").EnvironmentContext;
  /** Target position for directional beam factors (C2). */
  target?: import("./spatial.js").Position3;
}

/** Graded multiplier factor: m(context, sensor) → [0, 1] typically. */
export type EnvFactor = (ctx: EnvMultContext) => number;

/** Motion degradation: e^(−k·speed/vmax). */
export function envMultMotion(kMotion: number, speedKn: number, topSpeedKn: number): number {
  if (topSpeedKn <= 0) return 1;
  return Math.exp(-kMotion * (speedKn / topSpeedKn));
}

export function motionEnvFactor(ctx: EnvMultContext): number {
  const { sensor, vehicle } = ctx;
  return envMultMotion(sensor.k_motion, vehicle.speed_kn, vehicle.top_speed_kn);
}

export { salinityFactor } from "./envFactors/salinityFactor.js";
export { seaStateFactor } from "./envFactors/seaStateFactor.js";
export { fogFactor } from "./envFactors/fogFactor.js";

export const DEFAULT_ENV_FACTORS: EnvFactor[] = [
  motionEnvFactor,
  salinityFactor,
  seaStateFactor,
  fogFactor,
  beamGainFactor,
];

/** Product over extensible factor list — seam for salinity, sea-state, fog, beamGain. */
export function envMult(factors: EnvFactor[], ctx: EnvMultContext): number {
  return factors.reduce((product, factor) => product * factor(ctx), 1);
}
