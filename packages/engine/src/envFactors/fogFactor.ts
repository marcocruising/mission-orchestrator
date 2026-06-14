import type { EnvFactor } from "../envMult.js";
import { vehicleStateToPosition3 } from "../spatial.js";

/** EO/IR degradation vs visibility — stub returns 1.0 until D1 import body. */
export const fogFactor: EnvFactor = (ctx) => {
  const env = ctx.environment;
  if (!env) return 1;
  void env.sample("fog_vis_km", vehicleStateToPosition3(ctx.vehicle));
  return 1;
};
