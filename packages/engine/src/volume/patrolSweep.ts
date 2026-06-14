import type { Position3 } from "../spatial.js";
import type { Assignment, EngineInput, TaskDef } from "../stateEngine.js";
import type { PlanMove } from "../planner.js";
import { cellVisitScore } from "./coverageVolume.js";
import { discretizeFootprint } from "./footprint.js";

/** Max patrol cell candidates per AREA task — keep planner finite (C1b). */
export const MAX_PATROL_CANDIDATES = 3;

const PATROL_PREFIX = "patrol:";

/** Opaque patrol operating-point handle — planner never parses internals (B3). */
export function formatPatrolHandle(cellId: string): string {
  return `${PATROL_PREFIX}${cellId}`;
}

export function parsePatrolHandle(operatingPoint: string): { cell_id: string } | null {
  if (!operatingPoint.startsWith(PATROL_PREFIX)) return null;
  const cell_id = operatingPoint.slice(PATROL_PREFIX.length);
  return cell_id.length > 0 ? { cell_id } : null;
}

export function patrolCellPosition(
  task: TaskDef,
  cellId: string
): Position3 | null {
  if (!task.area) return null;
  const cells = discretizeFootprint(
    task.area.footprint,
    task.area.z_min_m,
    task.area.z_max_m,
    task.area.cell_size_m
  );
  return cells.find((c) => c.cell_id === cellId)?.center ?? null;
}

/** Rank cells by lowest visit score — unvisited first (C1b sweep targets). */
export function patrolSweepCellCandidates(
  input: EngineInput,
  task: TaskDef,
  maxCandidates = MAX_PATROL_CANDIDATES
): string[] {
  if (!task.area) return [];
  const cells = discretizeFootprint(
    task.area.footprint,
    task.area.z_min_m,
    task.area.z_max_m,
    task.area.cell_size_m
  );
  const visits = input.volumeVisits?.get(task.id) ?? [];
  const visitMap = new Map(visits.map((v) => [v.cell_id, v]));

  const ranked = cells
    .map((cell) => ({
      cell_id: cell.cell_id,
      score: cellVisitScore(visitMap.get(cell.cell_id), input.now, task.area!.revisit_interval_s),
    }))
    .sort((a, b) => a.score - b.score);

  return ranked.slice(0, maxCandidates).map((r) => r.cell_id);
}

export function patrolSweepMovesForTask(
  input: EngineInput,
  task: TaskDef,
  assetId: string
): PlanMove[] {
  return patrolSweepCellCandidates(input, task).map((cell_id) => ({
    kind: "set_operating_point" as const,
    asset_id: assetId,
    operating_point: formatPatrolHandle(cell_id),
  }));
}

/**
 * Sandbox-only hypothetical positions for patrol handles (C1b).
 * Live ticks omit planningOverrides — belief position only.
 */
export function planningOverridesForAssignments(
  input: EngineInput,
  assignments: Assignment[]
): Map<string, Position3> | undefined {
  const overrides = new Map<string, Position3>();
  const taskMap = new Map(input.missions.flatMap((m) => m.tasks.map((t) => [t.id, t] as const)));

  for (const asn of assignments) {
    const patrol = parsePatrolHandle(asn.operating_point);
    if (!patrol) continue;
    const task = taskMap.get(asn.task_id);
    if (!task) continue;
    const pos = patrolCellPosition(task, patrol.cell_id);
    if (pos) overrides.set(asn.asset_id, pos);
  }

  return overrides.size > 0 ? overrides : undefined;
}
