import {
  CV6_STATE_DIM,
  StateLayout,
  M_PER_KM,
  kmToM,
  mToKm,
} from "./spatial.js";

/** 6D CV state: [x_m, y_m, z_m, vx, vy, vz] — SI meters / m/s. */
export const ESTIMATE_STATE_DIM = CV6_STATE_DIM;
export const LEGACY_ESTIMATE_STATE_DIM = 4;

export type EstimateLayout = "cv6";

export interface Estimate {
  layout: EstimateLayout;
  mean: number[];
  cov: number[][];
  ts: number;
}

export interface UncertaintyRegion {
  center: { x_km: number; y_km: number };
  semiMajor: number;
  semiMinor: number;
  angleRad: number;
}

export const DEFAULT_POSITION_SIGMA_M = 500;
/** Large z variance when depth is unknown (legacy 4D migration). */
export const DEFAULT_Z_SIGMA_M = 500;

function zeroMatrix(n: number): number[][] {
  return Array.from({ length: n }, () => Array(n).fill(0));
}

/** v1 initial estimate: diagonal position σ², zero velocity. */
export function createInitialEstimate(
  x_m: number,
  y_m: number,
  z_m: number,
  ts: number,
  sigmaM = DEFAULT_POSITION_SIGMA_M,
  zSigmaM = DEFAULT_Z_SIGMA_M
): Estimate {
  const s2 = sigmaM * sigmaM;
  const z2 = zSigmaM * zSigmaM;
  const velVar = 1e-6;
  return {
    layout: "cv6",
    mean: [x_m, y_m, z_m, 0, 0, 0],
    cov: [
      [s2, 0, 0, 0, 0, 0],
      [0, s2, 0, 0, 0, 0],
      [0, 0, z2, 0, 0, 0],
      [0, 0, 0, velVar, 0, 0],
      [0, 0, 0, 0, velVar, 0],
      [0, 0, 0, 0, 0, velVar],
    ],
    ts,
  };
}

/** Vertical uncertainty from the Z component of cv6 state. */
export function zUncertainty(
  mean: number[],
  cov: number[][]
): { z_m: number; sigma_m: number } {
  return {
    z_m: mean[StateLayout.Z],
    sigma_m: Math.sqrt(cov[StateLayout.Z][StateLayout.Z]),
  };
}

/** Upgrade legacy 4D `[x_km, y_km, vx, vy]` JSON to cv6 SI state. */
export function migrateEstimate(raw: unknown): Estimate {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Estimate must be an object");
  }
  const obj = raw as Partial<Estimate> & {
    mean?: number[];
    cov?: number[][];
    ts?: number;
    layout?: string;
  };

  if (
    obj.layout === "cv6" &&
    Array.isArray(obj.mean) &&
    obj.mean.length === ESTIMATE_STATE_DIM &&
    Array.isArray(obj.cov)
  ) {
    const est: Estimate = {
      layout: "cv6",
      mean: obj.mean,
      cov: obj.cov,
      ts: obj.ts as number,
    };
    assertValidEstimate(est);
    return est;
  }

  if (Array.isArray(obj.mean) && obj.mean.length === LEGACY_ESTIMATE_STATE_DIM) {
    return legacy4DToCv6({
      mean: obj.mean,
      cov: obj.cov ?? zeroMatrix(LEGACY_ESTIMATE_STATE_DIM),
      ts: obj.ts ?? 0,
    });
  }

  throw new Error("Unrecognized estimate format");
}

function legacy4DToCv6(legacy: {
  mean: number[];
  cov: number[][];
  ts: number;
}): Estimate {
  const [x_km, y_km, vx_kms, vy_kms] = legacy.mean;
  const mean = [kmToM(x_km), kmToM(y_km), 0, kmToM(vx_kms), kmToM(vy_kms), 0];
  const m2 = M_PER_KM * M_PER_KM;
  const cov = zeroMatrix(ESTIMATE_STATE_DIM);

  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      cov[i][j] = legacy.cov[i][j] * m2;
    }
  }
  cov[StateLayout.Z][StateLayout.Z] = DEFAULT_Z_SIGMA_M ** 2;
  cov[StateLayout.VX][StateLayout.VX] =
    (legacy.cov[2]?.[2] ?? 1e-6) * m2;
  cov[StateLayout.VY][StateLayout.VY] =
    (legacy.cov[3]?.[3] ?? 1e-6) * m2;
  cov[StateLayout.VZ][StateLayout.VZ] = 1e-6;

  const est: Estimate = { layout: "cv6", mean, cov, ts: legacy.ts };
  assertValidEstimate(est);
  return est;
}

/** Symmetric matrix positive-definite check (eigenvalues > ε). */
export function isPositiveDefinite(cov: number[][], epsilon = 1e-9): boolean {
  if (cov.length === 0) return false;
  for (const row of cov) {
    if (row.length !== cov.length) return false;
  }
  const n = cov.length;
  if (n === 1) return cov[0][0] > epsilon;
  if (n === 2) {
    const [a, b] = [cov[0][0], (cov[0][1] + cov[1][0]) / 2];
    const c = cov[1][1];
    const disc = Math.sqrt((a - c) ** 2 + 4 * b * b);
    const l1 = (a + c + disc) / 2;
    const l2 = (a + c - disc) / 2;
    return l1 > epsilon && l2 > epsilon;
  }
  const L = [...cov.map((row) => [...row])];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = L[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum < epsilon) return false;
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return true;
}

/**
 * Map the horizontal x–y block of cv6 covariance to an uncertainty ellipse (km display).
 * k scales the ellipse (default 2 ≈ 95% containment for Gaussian).
 */
export function covToEllipse(
  cov: number[][],
  mean: number[],
  k = 2
): UncertaintyRegion {
  const xi = StateLayout.X;
  const yi = StateLayout.Y;
  const a = cov[xi][xi];
  const b = (cov[xi][yi] + cov[yi][xi]) / 2;
  const c = cov[yi][yi];
  const disc = Math.sqrt((a - c) ** 2 + 4 * b * b);
  const lambda1 = (a + c + disc) / 2;
  const lambda2 = (a + c - disc) / 2;
  if (lambda2 <= 0) {
    throw new Error("Position covariance block is not positive definite");
  }
  const semiMajor = mToKm(k * Math.sqrt(Math.max(lambda1, lambda2)));
  const semiMinor = mToKm(k * Math.sqrt(Math.min(lambda1, lambda2)));
  const angleRad = 0.5 * Math.atan2(2 * b, a - c);
  return {
    center: { x_km: mToKm(mean[xi]), y_km: mToKm(mean[yi]) },
    semiMajor,
    semiMinor,
    angleRad,
  };
}

export function traceCov(cov: number[][]): number {
  return cov.reduce((sum, row, i) => sum + row[i], 0);
}

export function serializeEstimate(est: Estimate): string {
  return JSON.stringify(est);
}

export function deserializeEstimate(json: string): Estimate {
  return migrateEstimate(JSON.parse(json));
}

export function assertValidEstimate(est: Estimate): void {
  if (est.layout !== "cv6") {
    throw new Error('Estimate.layout must be "cv6"');
  }
  if (!Array.isArray(est.mean) || est.mean.length !== ESTIMATE_STATE_DIM) {
    throw new Error(`Estimate.mean must have length ${ESTIMATE_STATE_DIM}`);
  }
  if (
    !Array.isArray(est.cov) ||
    est.cov.length !== ESTIMATE_STATE_DIM ||
    est.cov.some((row) => !Array.isArray(row) || row.length !== ESTIMATE_STATE_DIM)
  ) {
    throw new Error(`Estimate.cov must be ${ESTIMATE_STATE_DIM}×${ESTIMATE_STATE_DIM}`);
  }
  if (typeof est.ts !== "number" || !Number.isFinite(est.ts)) {
    throw new Error("Estimate.ts must be a finite number");
  }
}
