import type { EnvFactor } from "../envMult.js";
import { vehicleStateToPosition3 } from "../spatial.js";
import { isPassiveAcoustic, salinityMult } from "./curves.js";

/** Acoustic absorption vs salinity — passive_acoustic only (D1). */
export const salinityFactor: EnvFactor = (ctx) => {
  if (!isPassiveAcoustic(ctx.sensor.sensor)) return 1;
  const env = ctx.environment;
  if (!env) return 1;
  const psu = env.sample("salinity_psu", vehicleStateToPosition3(ctx.vehicle));
  return salinityMult(psu);
};
