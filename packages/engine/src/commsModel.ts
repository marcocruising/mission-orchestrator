import type { Assignment } from "./stateEngine.js";

export interface CommsLink {
  from_id: string;
  to_id: string;
  bandwidth_bps: number;
  delay_s: number;
  ts: number;
}

/** Seam for link budgets, latency, and fleet bandwidth (T2.7 / D2). */
export interface CommsModel {
  linkBudget(from: string, to: string, ts: number): CommsLink | null;
  messageDeliveryTs(sentTs: number, from: string, to: string): number;
  fleetUsage(assignments: Assignment[], ts: number): number;
}

/** v1 body: zero delay, zero fleet load — demo behavior unchanged until import (D2). */
export const staticCommsModel: CommsModel = {
  linkBudget(from, to, ts) {
    return {
      from_id: from,
      to_id: to,
      bandwidth_bps: Number.MAX_SAFE_INTEGER,
      delay_s: 0,
      ts,
    };
  },
  messageDeliveryTs(sentTs) {
    return sentTs;
  },
  fleetUsage() {
    return 0;
  },
};
