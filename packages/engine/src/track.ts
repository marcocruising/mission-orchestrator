import type { Estimate } from "./estimate.js";
import type { Observation } from "./measurement.js";

/** External contact track — parallel to scalar belief_facts for own assets in v1. */
export interface Track {
  id: string;
  estimate: Estimate;
  last_updated: number;
  contributing: string[];
  classification?: string;
}

export function createTrackFromObservation(
  id: string,
  observation: Observation,
  estimate: Estimate
): Track {
  const contributors = observation.observer_id ? [observation.observer_id] : [];
  return {
    id,
    estimate,
    last_updated: observation.ts,
    contributing: contributors,
    classification: undefined,
  };
}

export function mergeTrackObservation(track: Track, observation: Observation, estimate: Estimate): Track {
  const contributors = track.contributing.includes(observation.observer_id)
    ? track.contributing
    : [...track.contributing, observation.observer_id];
  return {
    ...track,
    estimate,
    last_updated: Math.max(track.last_updated, observation.ts),
    contributing: contributors,
  };
}

/** DB row shape for tracks table. */
export interface TrackRow {
  id: string;
  estimate: Estimate;
  last_updated: number;
  contributing: string[];
  classification: string | null;
}

export function trackToRow(track: Track): TrackRow {
  return {
    id: track.id,
    estimate: track.estimate,
    last_updated: track.last_updated,
    contributing: track.contributing,
    classification: track.classification ?? null,
  };
}

export function rowToTrack(row: TrackRow): Track {
  return {
    id: row.id,
    estimate: row.estimate,
    last_updated: row.last_updated,
    contributing: row.contributing ?? [],
    classification: row.classification ?? undefined,
  };
}
