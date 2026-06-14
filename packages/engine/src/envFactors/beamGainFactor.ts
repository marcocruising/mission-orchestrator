import type { EnvFactor } from "../envMult.js";
import { losAnglesDeg, pointingSeparationDeg, beamGain } from "../sensors/beamGeometry.js";
import { vehicleStateToPosition3 } from "../spatial.js";

/**
 * Directional sensor beam — graded multiplier (C2 / T3.2).
 * Omnidirectional sensors omit beam_half_angle_deg → no-op (=1.0).
 */
export const beamGainFactor: EnvFactor = (ctx) => {
  const halfAngle = ctx.sensor.beam_half_angle_deg;
  if (halfAngle == null || halfAngle <= 0 || !ctx.target) return 1;

  const vehiclePos = vehicleStateToPosition3(ctx.vehicle);
  const { bearing_deg, elevation_deg } = losAnglesDeg(vehiclePos, ctx.target);

  let sensorBearing = ctx.vehicle.bearing_deg;
  let sensorElevation = ctx.vehicle.elevation_deg ?? 0;

  if (sensorBearing == null) {
    sensorBearing = 0;
    sensorElevation = 0;
  }

  const offAxis = pointingSeparationDeg(
    { bearing_deg: sensorBearing, elevation_deg: sensorElevation },
    { bearing_deg, elevation_deg }
  );
  return beamGain(offAxis, halfAngle);
};
