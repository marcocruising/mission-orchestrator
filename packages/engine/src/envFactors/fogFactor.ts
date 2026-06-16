import type { EnvFactor } from "../envMult.js";
import { vehicleStateToPosition3 } from "../spatial.js";
import { fogVisMult, isEoIr } from "./curves.js";

/** EO/IR degradation vs visibility (D1). */
export const fogFactor: EnvFactor = (ctx) => {
  if (!isEoIr(ctx.sensor.sensor)) return 1;
  const env = ctx.environment;
  if (!env) return 1;
  const visKm = env.sample("fog_vis_km", vehicleStateToPosition3(ctx.vehicle));
  return fogVisMult(visKm);
};
