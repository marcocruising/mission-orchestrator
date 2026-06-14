import { describe, it, expect } from "vitest";
import { ENGINE_VERSION } from "./index.js";

describe("engine scaffold", () => {
  it("exports a version", () => {
    expect(ENGINE_VERSION).toBe("0.0.0");
  });
});
