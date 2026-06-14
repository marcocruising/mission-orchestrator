import type { EnvFactor } from "../envMult.js";
import { vehicleStateToPosition3 } from "../spatial.js";

/** Surface sensor degradation vs significant wave height — stub returns 1.0 until D1. */
export const seaStateFactor: EnvFactor = (ctx) => {
  const env = ctx.environment;
  if (!env) return 1;
  void env.sample("sea_state_hs_m", vehicleStateToPosition3(ctx.vehicle));
  return 1;
};
