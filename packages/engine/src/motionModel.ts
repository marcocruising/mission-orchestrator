import type { EnvironmentContext } from "./environmentContext.js";
import type { Position3 } from "./spatial.js";
import { CV6_STATE_DIM, StateLayout } from "./spatial.js";
import { matAdd, matMul, matTranspose } from "./measurement.js";

export interface MotionModel {
  predict(
    state: number[],
    dt: number,
    env?: EnvironmentContext
  ): { mean: number[]; Q: number[][] };
}

export const DEFAULT_PROCESS_NOISE_Q0 = 1;

/** Windage: fraction of wind speed transferred to surface drift (USV). */
export const SURFACE_WINDAGE = 0.04;
/** Windage for air assets (UAV). */
export const AIR_WINDAGE = 0.1;

function identity(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
}

/** Ocean current + optional surface/air wind drift in m/s (east, north). */
export function environmentDriftMs(env: EnvironmentContext, pos: Position3): { u_ms: number; v_ms: number } {
  const u_ms = env.sample("current_u_ms", pos) ?? 0;
  const v_ms = env.sample("current_v_ms", pos) ?? 0;

  const windMs = env.sample("wind_ms", pos);
  const windFromDeg = env.sample("wind_direction_deg", pos);
  if (windMs == null || windFromDeg == null) return { u_ms, v_ms };

  if (pos.z_m >= 0) {
    const towardRad = ((windFromDeg + 180) * Math.PI) / 180;
    const windage = pos.z_m > 1 ? AIR_WINDAGE : SURFACE_WINDAGE;
    return {
      u_ms: u_ms + windMs * windage * Math.sin(towardRad),
      v_ms: v_ms + windMs * windage * Math.cos(towardRad),
    };
  }

  return { u_ms, v_ms };
}

/** Constant-velocity transition matrix for cv6 state. */
export function cvTransitionMatrix(dt: number, n = CV6_STATE_DIM): number[][] {
  const F = identity(n);
  if (n >= 6) {
    F[StateLayout.X][StateLayout.VX] = dt;
    F[StateLayout.Y][StateLayout.VY] = dt;
    F[StateLayout.Z][StateLayout.VZ] = dt;
  }
  return F;
}

/** v1 body: mean += (v + env drift)·dt, Q = q0·dt·I (6D SI state). */
export class ConstantVelocityModel implements MotionModel {
  constructor(private q0 = DEFAULT_PROCESS_NOISE_Q0) {}

  predict(state: number[], dt: number, env?: EnvironmentContext): { mean: number[]; Q: number[][] } {
    const n = state.length;
    const mean = [...state];
    if (n >= 6) {
      mean[StateLayout.X] += state[StateLayout.VX] * dt;
      mean[StateLayout.Y] += state[StateLayout.VY] * dt;
      mean[StateLayout.Z] += state[StateLayout.VZ] * dt;

      if (env) {
        const pos: Position3 = {
          x_m: mean[StateLayout.X],
          y_m: mean[StateLayout.Y],
          z_m: mean[StateLayout.Z],
        };
        const { u_ms, v_ms } = environmentDriftMs(env, pos);
        mean[StateLayout.X] += u_ms * dt;
        mean[StateLayout.Y] += v_ms * dt;
      }
    }
    const q = this.q0 * dt;
    const Q = identity(n).map((row, i) => row.map((_v, j) => (i === j ? q : 0)));
    return { mean, Q };
  }
}

export const defaultConstantVelocityModel = new ConstantVelocityModel();

/** Propagate mean/cov through one CV step: P' = F P Fᵀ + Q. */
export function propagateState(
  mean: number[],
  cov: number[][],
  dt: number,
  model: MotionModel = defaultConstantVelocityModel,
  env?: EnvironmentContext
): { mean: number[]; cov: number[][] } {
  if (dt <= 0) {
    return { mean: [...mean], cov: cov.map((row) => [...row]) };
  }
  const F = cvTransitionMatrix(dt, mean.length);
  const { mean: newMean, Q } = model.predict(mean, dt, env);
  const newCov = matAdd(matMul(matMul(F, cov), matTranspose(F)), Q);
  return { mean: newMean, cov: newCov };
}

/** Initial lost-contact state: known position, v_max velocity uncertainty. */
export function initialLostContactState(
  x_m: number,
  y_m: number,
  z_m: number,
  vMaxMs: number,
  posSigmaM = 10
): { mean: number[]; cov: number[][] } {
  const posVar = posSigmaM * posSigmaM;
  const velVar = vMaxMs * vMaxMs;
  const velVarZ = 1e-6;
  return {
    mean: [x_m, y_m, z_m, 0, 0, 0],
    cov: [
      [posVar, 0, 0, 0, 0, 0],
      [0, posVar, 0, 0, 0, 0],
      [0, 0, posVar, 0, 0, 0],
      [0, 0, 0, velVar, 0, 0],
      [0, 0, 0, 0, velVar, 0],
      [0, 0, 0, 0, 0, velVarZ],
    ],
  };
}

export function traceProcessNoise(Q: number[][]): number {
  return Q.reduce((sum, row, i) => sum + row[i], 0);
}
