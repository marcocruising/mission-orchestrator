import {
  advanceOneTick,
  applyScenarioPlan,
  getCurrentTick,
  replayToTick,
  scenarioInfo,
} from "./scenario-run.js";

export interface ApiResponse {
  status: number;
  body: unknown;
}

function missingSupabase(): ApiResponse {
  return {
    status: 503,
    body: {
      error: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env to advance ticks from the UI",
    },
  };
}

export async function handleApi(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<ApiResponse> {
  if (method === "GET" && path === "/api/scenario") {
    const currentTick = process.env.SUPABASE_URL ? await getCurrentTick() : -1;
    return { status: 200, body: { ...scenarioInfo(), currentTick } };
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return missingSupabase();
  }

  if (method === "POST" && path === "/api/tick/next") {
    const { tick, result } = await advanceOneTick();
    return {
      status: 200,
      body: {
        tick,
        topPlan: result.topPlan,
        alerts: result.alerts,
        missions: result.missionStates.map((s) => ({
          mission_id: s.mission_id,
          tier: s.tier,
          cov_now: s.cov_now,
          confidence: s.confidence,
          salience: s.salience,
        })),
      },
    };
  }

  if (method === "POST" && path === "/api/tick/goto") {
    const target = Number(body?.tick);
    if (Number.isNaN(target)) {
      return { status: 400, body: { error: "tick is required" } };
    }
    const { tick, results } = await replayToTick(target);
    const last = results[results.length - 1];
    return {
      status: 200,
      body: {
        tick,
        topPlan: last?.topPlan ?? null,
        alerts: last?.alerts ?? [],
      },
    };
  }

  if (method === "POST" && path === "/api/reset") {
    const { tick } = await replayToTick(-1);
    return { status: 200, body: { tick } };
  }

  if (method === "POST" && path === "/api/apply-plan") {
    const planId = body?.planId;
    if (typeof planId !== "string" || !planId) {
      return { status: 400, body: { error: "planId is required" } };
    }
    await applyScenarioPlan(planId, typeof body?.tick === "number" ? body.tick : undefined);
    return { status: 200, body: { ok: true, planId } };
  }

  return { status: 404, body: { error: "Not found" } };
}
