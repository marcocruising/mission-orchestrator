import type { Position3 } from "../spatial.js";

const DEG = 180 / Math.PI;

/** Azimuth (0° = +x / east) and elevation from observer to target in degrees. */
export function losAnglesDeg(from: Position3, to: Position3): {
  bearing_deg: number;
  elevation_deg: number;
} {
  const dx = to.x_m - from.x_m;
  const dy = to.y_m - from.y_m;
  const dz = to.z_m - from.z_m;
  const horiz = Math.sqrt(dx * dx + dy * dy);
  const bearing_deg = ((Math.atan2(dy, dx) * DEG) + 360) % 360;
  const elevation_deg = Math.atan2(dz, horiz) * DEG;
  return { bearing_deg, elevation_deg };
}

/** Smallest signed difference between two bearings in degrees. */
export function bearingDeltaDeg(a: number, b: number): number {
  let d = ((b - a + 540) % 360) - 180;
  return d;
}

/** 3D angular separation between two pointing vectors (bearing + elevation). */
export function pointingSeparationDeg(
  a: { bearing_deg: number; elevation_deg: number },
  b: { bearing_deg: number; elevation_deg: number }
): number {
  const br = (a.bearing_deg * Math.PI) / 180;
  const er = (a.elevation_deg * Math.PI) / 180;
  const bx = Math.cos(er) * Math.cos(br);
  const by = Math.cos(er) * Math.sin(br);
  const bz = Math.sin(er);

  const br2 = (b.bearing_deg * Math.PI) / 180;
  const er2 = (b.elevation_deg * Math.PI) / 180;
  const cx = Math.cos(er2) * Math.cos(br2);
  const cy = Math.cos(er2) * Math.sin(br2);
  const cz = Math.sin(er2);

  const dot = Math.max(-1, Math.min(1, bx * cx + by * cy + bz * cz));
  return Math.acos(dot) * DEG;
}

/**
 * Graded beam gain — 1.0 on boresight, cosine taper to 0 at beam edge.
 * Future scan-time / dwell bodies can reuse this seam without changing rollup.
 */
export function beamGain(offAxisDeg: number, halfAngleDeg: number): number {
  if (halfAngleDeg <= 0) return 1;
  if (offAxisDeg >= halfAngleDeg) return 0;
  return Math.cos((offAxisDeg / halfAngleDeg) * (Math.PI / 2));
}

/** True when target LOS lies within the sensor beam cone. */
export function inBeamRange(
  halfAngleDeg: number | undefined,
  sensorBearingDeg: number | undefined,
  sensorElevationDeg: number | undefined,
  targetBearingDeg: number,
  targetElevationDeg: number
): boolean {
  if (halfAngleDeg == null || halfAngleDeg <= 0) return true;
  if (sensorBearingDeg == null) return true;

  const sep = pointingSeparationDeg(
    { bearing_deg: sensorBearingDeg, elevation_deg: sensorElevationDeg ?? 0 },
    { bearing_deg: targetBearingDeg, elevation_deg: targetElevationDeg }
  );
  return sep <= halfAngleDeg;
}
