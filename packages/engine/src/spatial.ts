/** SI horizontal/vertical position inside the engine — z-up, sea surface = 0. */
export interface Position3 {
  x_m: number;
  y_m: number;
  z_m: number;
}

export const M_PER_KM = 1000;

/** 6D constant-velocity state layout: [x_m, y_m, z_m, vx, vy, vz]. */
export const CV6_STATE_DIM = 6;

export const StateLayout = {
  X: 0,
  Y: 1,
  Z: 2,
  VX: 3,
  VY: 4,
  VZ: 5,
} as const;

/** Postgres depth_m (positive below surface) → engine z-up. */
export function depthMToZM(depth_m: number): number {
  return -depth_m;
}

/** Engine z-up → legacy depth_m for DB/UI export. */
export function zMToDepthM(z_m: number): number {
  return -z_m;
}

export function altitudeM(z_m: number): number {
  return Math.max(z_m, 0);
}

export function depthDisplayM(z_m: number): number {
  return Math.max(-z_m, 0);
}

export function kmToM(km: number): number {
  return km * M_PER_KM;
}

export function mToKm(m: number): number {
  return m / M_PER_KM;
}

/** Legacy DB columns → engine Position3. Prefer z_m when present (air assets). */
export function positionFromBeliefFields(
  horizontal: { x_km: number; y_km: number },
  vertical: { depth_m?: number; z_m?: number } = {}
): Position3 {
  const z_m =
    vertical.z_m !== undefined ? vertical.z_m : depthMToZM(vertical.depth_m ?? 0);
  return {
    x_m: kmToM(horizontal.x_km),
    y_m: kmToM(horizontal.y_km),
    z_m,
  };
}

export function positionFromLegacy(x_km: number, y_km: number, depth_m = 0): Position3 {
  return positionFromBeliefFields({ x_km, y_km }, { depth_m });
}

export function taskTargetToPosition3(target: {
  target_x: number;
  target_y: number;
  target_depth_m: number;
}): Position3 {
  return positionFromBeliefFields(
    { x_km: target.target_x, y_km: target.target_y },
    { depth_m: target.target_depth_m }
  );
}

/** Vehicle belief fields → engine Position3 (prefers z_m for air assets). */
export function vehicleStateToPosition3(vehicle: {
  x_km: number;
  y_km: number;
  depth_m: number;
  z_m?: number;
}): Position3 {
  return positionFromBeliefFields(
    { x_km: vehicle.x_km, y_km: vehicle.y_km },
    { depth_m: vehicle.depth_m, z_m: vehicle.z_m }
  );
}

/** Euclidean 3D distance in meters. */
export function slantRangeM(a: Position3, b: Position3): number {
  const dx = a.x_m - b.x_m;
  const dy = a.y_m - b.y_m;
  const dz = a.z_m - b.z_m;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Range seam — v1 body is 3D slant range in meters. */
export function rangeM(a: Position3, b: Position3): number {
  return slantRangeM(a, b);
}

/** Range seam — v1 body is 3D slant range in kilometers. */
export function rangeKm(a: Position3, b: Position3): number {
  return mToKm(slantRangeM(a, b));
}

/** Max depth (rating): z_m ≥ −depth_rating_m. */
export function checkMaxDepthRating(z_m: number, depth_rating_m: number): boolean {
  return z_m >= -depth_rating_m;
}

/** Must dive to min depth: z_m ≤ −min_depth_m. */
export function checkMinDepth(z_m: number, min_depth_m: number): boolean {
  return z_m <= -min_depth_m;
}

/** Air altitude band: 0 ≤ z_m ≤ max_altitude_m. */
export function checkMaxAltitude(z_m: number, max_altitude_m: number): boolean {
  return z_m >= 0 && z_m <= max_altitude_m;
}
