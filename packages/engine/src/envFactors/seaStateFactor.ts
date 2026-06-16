import type { EnvFactor } from "../envMult.js";
import { vehicleStateToPosition3 } from "../spatial.js";
import { isEoIr, isNearSurface, isPassiveAcoustic, seaStateMult } from "./curves.js";

/** Surface sensor degradation vs significant wave height (D1). */
export const seaStateFactor: EnvFactor = (ctx) => {
  const { sensor, vehicle } = ctx;
  const applies =
    isNearSurface(vehicle.depth_m) &&
    (isEoIr(sensor.sensor) || isPassiveAcoustic(sensor.sensor));
  if (!applies) return 1;

  const env = ctx.environment;
  if (!env) return 1;
  const hs = env.sample("sea_state_hs_m", vehicleStateToPosition3(ctx.vehicle));
  return seaStateMult(hs);
};
