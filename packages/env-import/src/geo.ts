import type { ScenarioGeo } from "./types.js";

const KM_PER_DEG_LAT = 111.32;

function kmPerDegLon(lat: number): number {
  return KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Scenario km grid → WGS84 (y_km north, x_km east from origin). */
export function kmToLatLon(geo: ScenarioGeo, x_km: number, y_km: number): { lat: number; lon: number } {
  const lonScale = kmPerDegLon(geo.origin_lat);
  return {
    lat: geo.origin_lat + y_km / KM_PER_DEG_LAT,
    lon: geo.origin_lon + x_km / lonScale,
  };
}

/** WGS84 → scenario km grid. */
export function latLonToKm(geo: ScenarioGeo, lat: number, lon: number): { x_km: number; y_km: number } {
  const lonScale = kmPerDegLon(geo.origin_lat);
  return {
    x_km: (lon - geo.origin_lon) * lonScale,
    y_km: (lat - geo.origin_lat) * KM_PER_DEG_LAT,
  };
}

/** Bounding box in WGS84 covering the scenario km extent (with margin). */
export function scenarioBBox(
  geo: ScenarioGeo,
  bounds_km: { min: number; max: number },
  margin_km = 1
): { min_lat: number; max_lat: number; min_lon: number; max_lon: number } {
  const sw = kmToLatLon(geo, bounds_km.min - margin_km, bounds_km.min - margin_km);
  const ne = kmToLatLon(geo, bounds_km.max + margin_km, bounds_km.max + margin_km);
  return {
    min_lat: sw.lat,
    max_lat: ne.lat,
    min_lon: sw.lon,
    max_lon: ne.lon,
  };
}
