import type { Assignment, EngineInput } from "./stateEngine.js";
import {
  recomputeMissionStates,
  checkCapacityGate,
  checkFleetCommsGate,
  DEFAULT_CONFIG,
  defaultResolveOperatingPoint,
} from "./stateEngine.js";
import { staticCommsModel } from "./commsModel.js";
import { staticEnvironmentContext } from "./environmentContext.js";
import { defaultConstantVelocityModel } from "./motionModel.js";
import { applyMovesToAssignments, type Plan } from "./planner.js";
export type { Plan, PlanMove } from "./planner.js";

export interface ApplyResult {
  ok: boolean;
  reason?: string;
  assignments?: Assignment[];
  missionStates?: ReturnType<typeof recomputeMissionStates>;
}

/** Re-validate plan against current belief before commit (P5/invariant #5). */
export function applyPlan(
  plan: Plan,
  input: EngineInput,
  tick: number,
  now: number
): ApplyResult {
  const newAssignments = applyMovesToAssignments(input.assignments, plan.moves).map((a) => ({
    ...a,
    issued_ts: a.issued_ts || now,
  }));

  if (!checkCapacityGate(newAssignments, input.missions, input.sensors)) {
    return { ok: false, reason: "Capacity gate failed at commit time" };
  }
  if (!checkFleetCommsGate(newAssignments, input.commsModel, input.now, input.config.comms_budget)) {
    return { ok: false, reason: "Fleet comms gate failed at commit time" };
  }

  const sandbox: EngineInput = { ...input, assignments: newAssignments };
  const states = recomputeMissionStates(sandbox, tick);

  for (const move of plan.moves) {
    if (move.kind === "reassign") {
      const asset = input.assets.find((a) => a.id === move.asset_id);
      const task = input.missions.flatMap((m) => m.tasks).find((t) => t.id === move.task_id);
      if (!asset || !task) {
        return { ok: false, reason: `Unknown asset or task in move: ${JSON.stringify(move)}` };
      }
    }
  }

  return { ok: true, assignments: newAssignments, missionStates: states };
}

export function buildEngineInput(
  partial: Omit<
    EngineInput,
    "resolveOperatingPoint" | "commsModel" | "environmentContext" | "motionModel" | "config"
  > & {
    config?: Partial<EngineInput["config"]>;
    resolveOperatingPoint?: EngineInput["resolveOperatingPoint"];
    commsModel?: EngineInput["commsModel"];
    environmentContext?: EngineInput["environmentContext"];
    motionModel?: EngineInput["motionModel"];
  }
): EngineInput {
  return {
    ...partial,
    config: { ...DEFAULT_CONFIG, ...partial.config },
    resolveOperatingPoint: partial.resolveOperatingPoint ?? defaultResolveOperatingPoint,
    commsModel: partial.commsModel ?? staticCommsModel,
    environmentContext: partial.environmentContext ?? staticEnvironmentContext(partial.now),
    motionModel: partial.motionModel ?? defaultConstantVelocityModel,
  };
}
