import type { EnvFactor } from "../envMult.js";
import { vehicleStateToPosition3 } from "../spatial.js";

/** Acoustic absorption vs salinity — stub returns 1.0 until D1 import body. */
export const salinityFactor: EnvFactor = (ctx) => {
  const env = ctx.environment;
  if (!env) return 1;
  void env.sample("salinity_psu", vehicleStateToPosition3(ctx.vehicle));
  return 1;
};
