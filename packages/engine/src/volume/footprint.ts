import type { Position3 } from "../spatial.js";

/** Horizontal footprint — v1: aabb only; polygon arm added later. */
export type Footprint =
  | {
      kind: "aabb";
      /** Center in engine SI meters. */
      center: { x_m: number; y_m: number };
      half_extent_m: { x: number; y: number };
    }
  | { kind: "polygon"; vertices_xy_m: { x_m: number; y_m: number }[] };

export interface VolumeCellSpec {
  cell_id: string;
  center: Position3;
}

export interface AreaTaskParams {
  footprint: Footprint;
  /** Deeper bound (more negative z-up). */
  z_min_m: number;
  /** Shallower bound (less negative z-up). */
  z_max_m: number;
  revisit_interval_s: number;
  cell_size_m: number;
}

export interface VolumeVisitRecord {
  cell_id: string;
  last_visit_ts: number;
  peak_quality: number;
}

const EPS = 1e-9;

function formatCellId(ix: number, iy: number, iz: number): string {
  const pad = (n: number) => (n < 0 ? String(n) : String(n).padStart(3, "0"));
  return `c:${pad(ix)}:${pad(iy)}:${pad(iz)}`;
}

/** Cell centers along one axis — half-cell inset from min boundary. */
function axisCellCenters(min: number, max: number, cellSize: number): number[] {
  if (max + EPS < min) {
    throw new Error("Invalid axis range: max < min");
  }
  const span = max - min;
  if (span <= EPS) {
    return [(min + max) / 2];
  }
  const n = Math.max(1, Math.ceil(span / cellSize));
  const centers: number[] = [];
  for (let i = 0; i < n; i++) {
    const lo = min + i * cellSize;
    const hi = Math.min(lo + cellSize, max);
    centers.push((lo + hi) / 2);
  }
  return centers;
}

function discretizeAabb(
  fp: Extract<Footprint, { kind: "aabb" }>,
  zMinM: number,
  zMaxM: number,
  cellSizeM: number
): VolumeCellSpec[] {
  const xMin = fp.center.x_m - fp.half_extent_m.x;
  const xMax = fp.center.x_m + fp.half_extent_m.x;
  const yMin = fp.center.y_m - fp.half_extent_m.y;
  const yMax = fp.center.y_m + fp.half_extent_m.y;

  const xs = axisCellCenters(xMin, xMax, cellSizeM);
  const ys = axisCellCenters(yMin, yMax, cellSizeM);
  const zs = axisCellCenters(zMinM, zMaxM, cellSizeM);

  const cells: VolumeCellSpec[] = [];
  for (let iz = 0; iz < zs.length; iz++) {
    for (let iy = 0; iy < ys.length; iy++) {
      for (let ix = 0; ix < xs.length; ix++) {
        cells.push({
          cell_id: formatCellId(ix, iy, iz),
          center: { x_m: xs[ix]!, y_m: ys[iy]!, z_m: zs[iz]! },
        });
      }
    }
  }
  return cells;
}

/** Discretize a patrol volume into opaque cell specs — only `footprint.kind` branches here. */
export function discretizeFootprint(
  footprint: Footprint,
  zMinM: number,
  zMaxM: number,
  cellSizeM: number
): VolumeCellSpec[] {
  if (cellSizeM <= 0) {
    throw new Error("cell_size_m must be positive");
  }
  switch (footprint.kind) {
    case "aabb":
      return discretizeAabb(footprint, zMinM, zMaxM, cellSizeM);
    case "polygon":
      throw new Error("Polygon footprint discretization not implemented (C1-polygon deferred)");
    default: {
      const _exhaustive: never = footprint;
      return _exhaustive;
    }
  }
}
