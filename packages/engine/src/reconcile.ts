import type { Fact } from "./types.js";

/**
 * Merge an incoming fact with an existing belief fact for the same (asset_id, field).
 * v1 body: newer timestamp wins; confidence is taken from the winning fact unchanged.
 * Future (D4 spoofing): lower confidence when sources disagree — same signature.
 */
export function reconcile(existing: Fact | undefined, incoming: Fact): Fact {
  if (!existing) return incoming;
  if (existing.ts > incoming.ts) return existing;
  return incoming;
}
