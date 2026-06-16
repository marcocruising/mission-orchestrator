/** Clamp to [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Acoustic salinity multiplier — passive sonar optimal near 35 PSU (North Atlantic).
 * Returns 1 when unknown; graded penalty for deviation (monotonic in |psu − ref|).
 */
export function salinityMult(psu: number | null, refPsu = 35, scalePsu = 8): number {
  if (psu == null) return 1;
  const delta = Math.abs(psu - refPsu);
  return clamp(Math.exp(-delta / scalePsu), 0.2, 1);
}

/**
 * Surface sea-state multiplier vs significant wave height (m).
 * Calm → 1; Hs ≥ 4 m → strong degradation.
 */
export function seaStateMult(hsM: number | null, scaleM = 2.5): number {
  if (hsM == null || hsM <= 0) return 1;
  return clamp(1 / (1 + hsM / scaleM), 0.15, 1);
}

/**
 * EO/IR visibility multiplier — full quality above refVisKm.
 * Open-Meteo caps visibility (~34 km); values above ref stay at 1.
 */
export function fogVisMult(visKm: number | null, refVisKm = 10): number {
  if (visKm == null || visKm <= 0) return 1;
  if (visKm >= refVisKm) return 1;
  return clamp(visKm / refVisKm, 0.05, 1);
}

export function isPassiveAcoustic(sensor: string): boolean {
  return sensor === "passive_acoustic";
}

export function isEoIr(sensor: string): boolean {
  return sensor === "eo_ir";
}

/** Surface/near-surface — sea state affects surface-mounted sensors. */
export function isNearSurface(depthM: number, thresholdM = 1): boolean {
  return depthM <= thresholdM;
}
