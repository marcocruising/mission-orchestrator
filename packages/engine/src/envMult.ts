import type { SensorSpec, VehicleState } from "./coverage.js";

/** Context passed to each environment multiplier factor (env field added in A2). */
export interface EnvMultContext {
  sensor: SensorSpec;
  vehicle: VehicleState;
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

export const DEFAULT_ENV_FACTORS: EnvFactor[] = [motionEnvFactor];

/** Product over extensible factor list — seam for salinity, sea-state, fog, beamGain. */
export function envMult(factors: EnvFactor[], ctx: EnvMultContext): number {
  return factors.reduce((product, factor) => product * factor(ctx), 1);
}
