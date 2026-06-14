/**
 * freshness(Δt) = 0.5^(Δt / H) — H is half-life in seconds.
 * At Δt=0 → 1; at Δt=H → 0.5 (README S1 done-when).
 */
export function freshness(deltaTs: number, halfLifeS = 120): number {
  if (deltaTs <= 0) return 1;
  return Math.pow(0.5, deltaTs / halfLifeS);
}

/** Effective confidence of a fact at time `now`. */
export function factConfidenceAt(
  fact: { confidence: number; ts: number; half_life_s?: number },
  now: number,
  defaultHalfLifeS = 120
): number {
  const H = fact.half_life_s ?? defaultHalfLifeS;
  const deltaTs = now - fact.ts;
  return fact.confidence * freshness(deltaTs, H);
}
