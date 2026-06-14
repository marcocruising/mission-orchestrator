import { describe, it, expect } from "vitest";
import { ENGINE_VERSION } from "@mission-orchestrator/engine";

describe("orchestrator scaffold", () => {
  it("depends on engine workspace", () => {
    expect(ENGINE_VERSION).toBeDefined();
  });
});
