import type { Assignment } from "./stateEngine.js";

export interface CommsNode {
  id: string;
  kind: "asset" | "relay" | "shore" | "sat_terminal";
}

export interface CommsLink {
  from_id: string;
  to_id: string;
  bandwidth_bps: number;
  delay_s: number;
  ts: number;
}

/** Row shape from DB loader — same fields as CommsLink. */
export type CommsLinkRow = CommsLink;

/** Seam for link budgets, routing, latency, and per-link utilization (T2.7 / D2). */
export interface CommsModel {
  linkBudget(from: string, to: string, ts: number): CommsLink | null;
  route(from: string, to: string, ts: number): string[];
  pathDelay(sentTs: number, from: string, to: string, ts?: number): number;
  linkUtilization(assignments: Assignment[], ts: number): Map<string, number>;
  /** Deprecated for gate when linkUtilization is populated; kept for simple demos. */
  fleetUsage(assignments: Assignment[], ts: number): number;
  messageDeliveryTs(sentTs: number, from: string, to: string, queryTs?: number): number;
}

export interface BuildCommsModelOptions {
  operatorId?: string;
  /** Bandwidth consumed per active assignment on each hop (bps). */
  loadBps?: number;
}

const DEFAULT_OPERATOR_ID = "operator";
const DEFAULT_LOAD_BPS = 1_000;

function linkKey(from: string, to: string): string {
  return `${from}:${to}`;
}

/** Keep the newest edge snapshot at or before query ts for each directed pair. */
export function selectActiveLinks(links: CommsLinkRow[], ts: number): CommsLinkRow[] {
  const byEdge = new Map<string, CommsLinkRow>();
  for (const link of links) {
    if (link.ts > ts) continue;
    const key = linkKey(link.from_id, link.to_id);
    const existing = byEdge.get(key);
    if (!existing || link.ts >= existing.ts) byEdge.set(key, link);
  }
  return [...byEdge.values()];
}

function buildAdjacency(links: CommsLinkRow[]): Map<string, CommsLinkRow[]> {
  const adj = new Map<string, CommsLinkRow[]>();
  for (const link of links) {
    const list = adj.get(link.from_id) ?? [];
    list.push(link);
    adj.set(link.from_id, list);
  }
  return adj;
}

/** BFS shortest path by hop count; endpoints included. */
export function findRoute(
  links: CommsLinkRow[],
  from: string,
  to: string
): string[] {
  if (from === to) return [from];
  const adj = buildAdjacency(links);
  const queue: string[] = [from];
  const prev = new Map<string, string | null>([[from, null]]);

  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const edge of adj.get(node) ?? []) {
      if (prev.has(edge.to_id)) continue;
      prev.set(edge.to_id, node);
      if (edge.to_id === to) {
        const path: string[] = [];
        let cur: string | null = to;
        while (cur != null) {
          path.unshift(cur);
          cur = prev.get(cur) ?? null;
        }
        return path;
      }
      queue.push(edge.to_id);
    }
  }

  return [from, to];
}

function sumPathDelay(path: string[], linkByEdge: Map<string, CommsLinkRow>): number {
  let delay = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const edge = linkByEdge.get(linkKey(path[i], path[i + 1]));
    delay += edge?.delay_s ?? 0;
  }
  return delay;
}

/** Graph body built from imported comms_links rows (v1 — BFS route, per-hop load). */
export function buildCommsModel(
  links: CommsLinkRow[],
  options: BuildCommsModelOptions = {}
): CommsModel {
  const operatorId = options.operatorId ?? DEFAULT_OPERATOR_ID;
  const loadBps = options.loadBps ?? DEFAULT_LOAD_BPS;

  function activeAt(ts: number): { links: CommsLinkRow[]; byEdge: Map<string, CommsLinkRow> } {
    const active = selectActiveLinks(links, ts);
    const byEdge = new Map(active.map((l) => [linkKey(l.from_id, l.to_id), l]));
    return { links: active, byEdge };
  }

  return {
    linkBudget(from, to, ts) {
      const { byEdge } = activeAt(ts);
      return byEdge.get(linkKey(from, to)) ?? null;
    },

    route(from, to, ts) {
      const { links: active } = activeAt(ts);
      if (active.length === 0) return from === to ? [from] : [from, to];
      return findRoute(active, from, to);
    },

    pathDelay(_sentTs, from, to, ts = _sentTs) {
      const { links: active, byEdge } = activeAt(ts);
      if (active.length === 0) return 0;
      const path = findRoute(active, from, to);
      return sumPathDelay(path, byEdge);
    },

    linkUtilization(assignments, ts) {
      const { links: active, byEdge } = activeAt(ts);
      if (active.length === 0) return new Map();

      const loadByEdge = new Map<string, number>();
      for (const asn of assignments) {
        const path = findRoute(active, asn.asset_id, operatorId);
        for (let i = 0; i < path.length - 1; i++) {
          const key = linkKey(path[i], path[i + 1]);
          loadByEdge.set(key, (loadByEdge.get(key) ?? 0) + loadBps);
        }
      }

      const util = new Map<string, number>();
      for (const [key, load] of loadByEdge) {
        const edge = byEdge.get(key);
        const capacity = edge?.bandwidth_bps ?? Number.MAX_SAFE_INTEGER;
        util.set(key, load / capacity);
      }
      return util;
    },

    fleetUsage() {
      return 0;
    },

    messageDeliveryTs(sentTs, from, to, queryTs) {
      const ts = queryTs ?? sentTs;
      return sentTs + this.pathDelay(sentTs, from, to, ts);
    },
  };
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
  route(from, to) {
    return from === to ? [from] : [from, to];
  },
  pathDelay() {
    return 0;
  },
  linkUtilization() {
    return new Map();
  },
  messageDeliveryTs(sentTs) {
    return sentTs;
  },
  fleetUsage() {
    return 0;
  },
};
