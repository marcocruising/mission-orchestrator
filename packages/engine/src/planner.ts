import type { Assignment, EngineInput } from "./stateEngine.js";
import {
  recomputeMissionStates,
  checkCapacityGate,
  checkFleetCommsGate,
  checkPointingGate,
} from "./stateEngine.js";
import { computeObjective } from "./objective.js";
import { planningOverridesForAssignments, patrolSweepMovesForTask } from "./volume/patrolSweep.js";
import { checkNoGoGate } from "./routePlanner.js";

export type PlanMove =
  | { kind: "reassign"; asset_id: string; task_id: string; operating_point: string }
  | { kind: "set_operating_point"; asset_id: string; operating_point: string };

export interface Plan {
  plan_id: string;
  moves: PlanMove[];
}

export interface PlanEval {
  plan_id: string;
  objective: number;
  cov_by_mission: Record<string, number>;
  total_exposure: number;
  cascades: { mission_id: string; delta: number }[];
  assumptions: string[];
  n_moves: number;
}

export interface PlannerRequest {
  input: EngineInput;
  affectedMissionIds: string[];
  baselineCov: Record<string, number>;
}

/** Seam for swapping heuristic planner vs MIP / column-generation solver (T1.10). */
export interface Planner {
  replan(request: PlannerRequest): PlanEval[];
}

function cloneAssignments(assignments: Assignment[]): Assignment[] {
  return assignments.map((a) => ({ ...a }));
}

export function applyMovesToAssignments(
  assignments: Assignment[],
  moves: PlanMove[]
): Assignment[] {
  let result = cloneAssignments(assignments);
  for (const move of moves) {
    if (move.kind === "reassign") {
      result = result.filter((a) => a.asset_id !== move.asset_id);
      result.push({
        id: `asn-${move.asset_id}-${move.task_id}`,
        asset_id: move.asset_id,
        task_id: move.task_id,
        operating_point: move.operating_point,
        issued_ts: 0,
      });
    } else if (move.kind === "set_operating_point") {
      result = result.map((a) =>
        a.asset_id === move.asset_id ? { ...a, operating_point: move.operating_point } : a
      );
    }
  }
  return result;
}

function evaluatePlan(
  plan: Plan,
  input: EngineInput,
  baselineCov: Record<string, number>
): PlanEval | null {
  const newAssignments = applyMovesToAssignments(input.assignments, plan.moves);
  if (!checkCapacityGate(newAssignments, input.missions, input.sensors)) return null;
  if (!checkFleetCommsGate(newAssignments, input.commsModel, input.now, input.config.comms_budget)) {
    return null;
  }
  if (
    !checkPointingGate(
      newAssignments,
      input.missions,
      input.sensors,
      input.belief,
      input.assets,
      input.resolveOperatingPoint
    )
  ) {
    return null;
  }

  const planningOverrides = planningOverridesForAssignments(input, newAssignments);
  if (
    !checkNoGoGate({
      assignments: newAssignments,
      missions: input.missions,
      belief: input.belief,
      assets: input.assets,
      planningOverrides,
      noGos: input.routePlanner.noGos,
    })
  ) {
    return null;
  }

  const sandboxInput: EngineInput = {
    ...input,
    assignments: newAssignments,
    planningOverrides,
  };
  const states = recomputeMissionStates(sandboxInput, input.now);
  const cov_by_mission: Record<string, number> = {};
  const cascades: { mission_id: string; delta: number }[] = [];

  for (const s of states) {
    cov_by_mission[s.mission_id] = s.cov_now;
    const base = baselineCov[s.mission_id] ?? s.cov_now;
    if (s.cov_now < base - 0.01) {
      cascades.push({ mission_id: s.mission_id, delta: s.cov_now - base });
    }
  }

  const routeMeasure = input.routePlanner.measure({
    assignments: newAssignments,
    missions: input.missions,
    belief: input.belief,
    assets: input.assets,
    planningOverrides,
  });
  const { exposure, risk } = routeMeasure;

  const objective = computeObjective({
    missions: input.missions,
    covByMission: cov_by_mission,
    nMoves: plan.moves.length,
    exposure,
    risk,
    config: input.config,
  });

  return {
    plan_id: plan.plan_id,
    objective,
    cov_by_mission,
    total_exposure: exposure,
    cascades,
    assumptions: planningOverrides
      ? [
          `exposure=${exposure.toFixed(3)}`,
          `risk=${risk.toFixed(3)}`,
          "belief frozen; patrol sandbox uses hypothetical cell positions",
        ]
      : [`exposure=${exposure.toFixed(3)}`, `risk=${risk.toFixed(3)}`, "belief frozen at eval time"],
    n_moves: plan.moves.length,
  };
}

function replanDefault({ input, affectedMissionIds, baselineCov }: PlannerRequest): PlanEval[] {
  const plans: Plan[] = [{ plan_id: "do-nothing", moves: [] }];

  const affectedTasks = input.missions
    .filter((m) => affectedMissionIds.includes(m.id))
    .flatMap((m) => m.tasks);

  const assignedAssets = new Set(input.assignments.map((a) => a.asset_id));
  const unassignedAssets = input.assets.filter((a) => !assignedAssets.has(a.id));

  for (const task of affectedTasks) {
    for (const asset of unassignedAssets) {
      plans.push({
        plan_id: `reassign-${asset.id}-${task.id}`,
        moves: [{ kind: "reassign", asset_id: asset.id, task_id: task.id, operating_point: "SLOW" }],
      });
    }
    for (const asset of input.assets) {
      for (const op of ["STATION", "SLOW", "FAST"] as const) {
        plans.push({
          plan_id: `op-${asset.id}-${op}`,
          moves: [{ kind: "set_operating_point", asset_id: asset.id, operating_point: op }],
        });
      }
    }

    if (task.kind === "AREA" && task.area) {
      for (const asn of input.assignments.filter((a) => a.task_id === task.id)) {
        for (const move of patrolSweepMovesForTask(input, task, asn.asset_id)) {
          const safeId = move.operating_point.replace(/:/g, "_");
          plans.push({
            plan_id: `patrol-${asn.asset_id}-${safeId}`,
            moves: [move],
          });
        }
      }
    }
  }

  if (plans.length >= 3) {
    plans.push({
      plan_id: `combo-${plans[1]!.plan_id}-${plans[2]!.plan_id}`,
      moves: [...plans[1]!.moves, ...plans[2]!.moves],
    });
  }

  const evals: PlanEval[] = [];
  for (const plan of plans) {
    const ev = evaluatePlan(plan, input, baselineCov);
    if (ev) evals.push(ev);
  }

  return evals.sort((a, b) => b.objective - a.objective);
}

export const defaultPlanner: Planner = {
  replan: replanDefault,
};

/** Minimal planner body for conformance tests — do-nothing only, same evaluation path. */
export const stubPlanner: Planner = {
  replan({ input, baselineCov }) {
    const ev = evaluatePlan({ plan_id: "do-nothing", moves: [] }, input, baselineCov);
    return ev ? [ev] : [];
  },
};

export function generateCandidates(
  input: EngineInput,
  affectedMissionIds: string[],
  baselineCov: Record<string, number>
): PlanEval[] {
  return defaultPlanner.replan({ input, affectedMissionIds, baselineCov });
}

/** Sandbox re-eval must match live path numbers (P2). */
export function sandboxMatchesLive(input: EngineInput, tick: number): boolean {
  const live = recomputeMissionStates(input, tick);
  const sandbox = recomputeMissionStates({ ...input }, tick);
  return live.every(
    (s, i) => s.cov_now === sandbox[i]!.cov_now && s.confidence === sandbox[i]!.confidence
  );
}
