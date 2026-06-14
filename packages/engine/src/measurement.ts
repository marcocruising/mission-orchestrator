import type { Estimate } from "./estimate.js";
import { StateLayout, kmToM } from "./spatial.js";

export interface ObserverPose {
  x_km: number;
  y_km: number;
}

/** Sensor measurement with explicit observation model h and noise R — never hardcoded in update(). */
export interface Measurement {
  z: number[];
  h: (state: number[]) => number[];
  R: number[][];
  ts: number;
  observer_pose: ObserverPose;
  observer_id: string;
  sensor: string;
}

export type Observation = Measurement & { track_id?: string };

/** Horizontal position fix: h(state) = [x_m, y_m], R = σ²·I (meters). */
export function positionMeasurement(
  z: [number, number],
  sigmaM: number,
  ts: number,
  observer: ObserverPose,
  observerId: string,
  sensor: string
): Measurement {
  const s2 = sigmaM * sigmaM;
  return {
    z: [z[0], z[1]],
    h: (state) => [state[StateLayout.X], state[StateLayout.Y]],
    R: [
      [s2, 0],
      [0, s2],
    ],
    ts,
    observer_pose: observer,
    observer_id: observerId,
    sensor,
  };
}

/** Full 3D position fix: h(state) = [x_m, y_m, z_m], R = σ²·I (meters). */
export function position3Measurement(
  z: [number, number, number],
  sigmaM: number,
  ts: number,
  observer: ObserverPose,
  observerId: string,
  sensor: string
): Measurement {
  const s2 = sigmaM * sigmaM;
  return {
    z: [z[0], z[1], z[2]],
    h: (state) => [state[StateLayout.X], state[StateLayout.Y], state[StateLayout.Z]],
    R: [
      [s2, 0, 0],
      [0, s2, 0],
      [0, 0, s2],
    ],
    ts,
    observer_pose: observer,
    observer_id: observerId,
    sensor,
  };
}

/** Horizontal bearing-only — azimuth in the horizontal plane (not full 3D LOS). */
export function horizontalBearingMeasurement(
  bearingRad: number,
  sigmaRad: number,
  ts: number,
  observer: ObserverPose,
  observerId: string,
  sensor: string
): Measurement {
  const s2 = sigmaRad * sigmaRad;
  return {
    z: [bearingRad],
    h: (state) => {
      const dx = state[StateLayout.X] - kmToM(observer.x_km);
      const dy = state[StateLayout.Y] - kmToM(observer.y_km);
      return [Math.atan2(dy, dx)];
    },
    R: [[s2]],
    ts,
    observer_pose: observer,
    observer_id: observerId,
    sensor,
  };
}

/** @deprecated Use horizontalBearingMeasurement — azimuth only, not elevation. */
export const bearingMeasurement = horizontalBearingMeasurement;

/** Numeric Jacobian of h at state (central differences). */
export function jacobianH(h: (state: number[]) => number[], state: number[], eps = 1e-6): number[][] {
  const z0 = h(state);
  const m = z0.length;
  const n = state.length;
  const H: number[][] = Array.from({ length: m }, () => Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    const up = [...state];
    const down = [...state];
    up[j] += eps;
    down[j] -= eps;
    const hUp = h(up);
    const hDown = h(down);
    for (let i = 0; i < m; i++) {
      H[i][j] = (hUp[i] - hDown[i]) / (2 * eps);
    }
  }
  return H;
}

export function matAdd(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

export function matSub(A: number[][], B: number[][]): number[][] {
  return A.map((row, i) => row.map((v, j) => v - B[i][j]));
}

export function matMul(A: number[][], B: number[][]): number[][] {
  const rows = A.length;
  const cols = B[0].length;
  const inner = B.length;
  const out: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < inner; k++) sum += A[i][k] * B[k][j];
      out[i][j] = sum;
    }
  }
  return out;
}

export function matTranspose(A: number[][]): number[][] {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

export function matVecMul(A: number[][], v: number[]): number[] {
  return A.map((row) => row.reduce((sum, a, j) => sum + a * v[j], 0));
}

export function vecAdd(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + b[i]);
}

export function vecSub(a: number[], b: number[]): number[] {
  return a.map((v, i) => v - b[i]);
}

export function identity(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
}

/** Invert small square matrix via Gauss-Jordan. */
export function invertMatrix(M: number[][]): number[][] {
  const n = M.length;
  const aug = M.map((row, i) => [...row, ...identity(n)[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
    }
    if (Math.abs(aug[pivot][col]) < 1e-12) {
      throw new Error("Matrix is singular");
    }
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col];
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      for (let j = 0; j < 2 * n; j++) aug[r][j] -= factor * aug[col][j];
    }
  }
  return aug.map((row) => row.slice(n));
}

export type EstimatorUpdateFn = (estimate: Estimate, measurement: Measurement) => Estimate;

/** Shared Kalman-style update using h and R from the measurement — sensor-agnostic. */
export function kalmanUpdate(estimate: Estimate, measurement: Measurement): Estimate {
  const H = jacobianH(measurement.h, estimate.mean);
  const zPred = measurement.h(estimate.mean);
  const innovation = vecSub(measurement.z, zPred);
  const HP = matMul(H, estimate.cov);
  const S = matAdd(matMul(HP, matTranspose(H)), measurement.R);
  const K = matMul(matMul(estimate.cov, matTranspose(H)), invertMatrix(S));
  const newMean = vecAdd(estimate.mean, matVecMul(K, innovation));
  const I = identity(estimate.mean.length);
  const KH = matMul(K, H);
  const newCov = matMul(matSub(I, KH), estimate.cov);
  return { layout: "cv6", mean: newMean, cov: newCov, ts: measurement.ts };
}
