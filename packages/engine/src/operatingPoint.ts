import type { Asset } from "./types.js";
import { parsePatrolHandle } from "./volume/patrolSweep.js";

/** Resolved operating point — opaque handle expanded by CapacityModel body (T1.6 / C2). */
export interface ResolvedOperatingPoint {
  speed_kn: number;
  bearing_deg?: number;
  elevation_deg?: number;
  raw_handle: string;
}

export type OperatingPointResolver = (asset: Asset, operatingPoint: string) => ResolvedOperatingPoint;

export function resolveSpeedKn(asset: Asset, operatingPoint: string): number {
  switch (operatingPoint) {
    case "STATION":
      return 0;
    case "SLOW":
      return asset.top_speed_kn * 0.25;
    case "FAST":
      return asset.top_speed_kn;
    default: {
      const n = Number(operatingPoint);
      return Number.isFinite(n) ? n : asset.top_speed_kn * 0.5;
    }
  }
}

/** Default resolver — enum, numeric, and JSON `{ bearing, speed? }` handles same code path. */
export function defaultResolveOperatingPoint(
  asset: Asset,
  operatingPoint: string
): ResolvedOperatingPoint {
  if (parsePatrolHandle(operatingPoint)) {
    return {
      speed_kn: resolveSpeedKn(asset, "SLOW"),
      raw_handle: operatingPoint,
    };
  }

  if (operatingPoint.startsWith("{")) {
    try {
      const parsed = JSON.parse(operatingPoint) as {
        bearing?: number;
        elevation?: number;
        speed?: string;
      };
      const speedHandle = typeof parsed.speed === "string" ? parsed.speed : "SLOW";
      return {
        speed_kn: resolveSpeedKn(asset, speedHandle),
        bearing_deg: typeof parsed.bearing === "number" ? parsed.bearing : undefined,
        elevation_deg: typeof parsed.elevation === "number" ? parsed.elevation : undefined,
        raw_handle: operatingPoint,
      };
    } catch {
      return { speed_kn: resolveSpeedKn(asset, operatingPoint), raw_handle: operatingPoint };
    }
  }

  return {
    speed_kn: resolveSpeedKn(asset, operatingPoint),
    raw_handle: operatingPoint,
  };
}

/** Back-compat helper — prefer resolveOperatingPoint on EngineInput. */
export function defaultResolveSpeed(asset: Asset, operatingPoint: string): number {
  return defaultResolveOperatingPoint(asset, operatingPoint).speed_kn;
}
