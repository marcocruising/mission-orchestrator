import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  buildEngineInput,
  checkFleetCommsGate,
  type Assignment,
} from "@mission-orchestrator/engine";
import { createServiceClient } from "./client.js";
import { loadCommsLinks, loadCommsModel } from "./comms.js";

const IT_PREFIX = "_itest_a3_";
const IT_TS = 9_000_000_000;
const UUV1 = `${IT_PREFIX}uuv1`;
const UUV2 = `${IT_PREFIX}uuv2`;
const RELAY = `${IT_PREFIX}relay`;

const TEST_LINKS = [
  { from_id: UUV1, to_id: RELAY, bandwidth_bps: 10_000, delay_s: 2, ts: IT_TS },
  { from_id: UUV2, to_id: RELAY, bandwidth_bps: 10_000, delay_s: 1, ts: IT_TS },
  { from_id: RELAY, to_id: "operator", bandwidth_bps: 1_000, delay_s: 3, ts: IT_TS },
];

function hasSupabaseEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

describe.skipIf(!hasSupabaseEnv())("comms Supabase integration (A3)", () => {
  const client = createServiceClient();

  beforeAll(async () => {
    const { error } = await client.from("comms_links").insert(TEST_LINKS);
    if (error) throw error;
  });

  afterAll(async () => {
    await client.from("comms_links").delete().gte("ts", IT_TS);
    await client
      .from("comms_links")
      .delete()
      .or(`from_id.like.${IT_PREFIX}%,to_id.like.${IT_PREFIX}%`);
  });

  it("loadCommsLinks returns inserted graph rows from remote Supabase", async () => {
    const links = await loadCommsLinks(client, IT_TS);
    const ours = links.filter(
      (l) => l.from_id.startsWith(IT_PREFIX) || l.to_id.startsWith(IT_PREFIX)
    );
    expect(ours.length).toBeGreaterThanOrEqual(3);
    expect(ours.some((l) => l.from_id === UUV1 && l.to_id === RELAY)).toBe(true);
  });

  it("loadCommsModel builds graph with multi-hop delay from DB rows", async () => {
    const model = await loadCommsModel(client, IT_TS);
    expect(model.pathDelay(0, UUV1, "operator", IT_TS)).toBe(5);
    expect(model.route(UUV1, "operator", IT_TS)).toEqual([UUV1, RELAY, "operator"]);
  });

  it("graph model from DB rejects fleet gate when shared relay is over budget", async () => {
    const model = await loadCommsModel(client, IT_TS);
    const oneAsset: Assignment[] = [
      { id: "a1", asset_id: UUV1, task_id: "t1", operating_point: "SLOW", issued_ts: 0 },
    ];
    const twoAssets: Assignment[] = [
      { id: "a1", asset_id: UUV1, task_id: "t1", operating_point: "SLOW", issued_ts: 0 },
      { id: "a2", asset_id: UUV2, task_id: "t2", operating_point: "FAST", issued_ts: 0 },
    ];

    expect(checkFleetCommsGate(oneAsset, model, IT_TS, 1_000_000)).toBe(true);
    expect(checkFleetCommsGate(twoAssets, model, IT_TS, 1_000_000)).toBe(false);

    const util = model.linkUtilization(twoAssets, IT_TS);
    expect(util.get(`${RELAY}:operator`)).toBe(2);
  });

  it("buildEngineInput with DB-loaded commsModel affects applyPlan comms gate", async () => {
    const commsModel = await loadCommsModel(client, IT_TS);
    const input = buildEngineInput({
      belief: new Map(),
      assets: [],
      sensors: [],
      missions: [],
      assignments: [
        { id: "a1", asset_id: UUV1, task_id: "t1", operating_point: "SLOW", issued_ts: 0 },
        { id: "a2", asset_id: UUV2, task_id: "t2", operating_point: "FAST", issued_ts: 0 },
      ],
      now: IT_TS,
      covBaselines: new Map(),
      commsModel,
    });

    expect(checkFleetCommsGate(input.assignments, input.commsModel, IT_TS, 1_000_000)).toBe(false);
    expect(input.commsModel.messageDeliveryTs(100, UUV1, "operator", IT_TS)).toBe(105);
  });
});

describe("comms integration env", () => {
  it("skips remote tests when Supabase env is missing", () => {
    if (hasSupabaseEnv()) {
      expect(process.env.SUPABASE_URL).toMatch(/^https:\/\//);
    } else {
      expect(hasSupabaseEnv()).toBe(false);
    }
  });
});
