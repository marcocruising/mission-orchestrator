import { describe, it, expect } from "vitest";
import { DB_PACKAGE } from "./index.js";

describe("db scaffold", () => {
  it("exports package id", () => {
    expect(DB_PACKAGE).toBe("@mission-orchestrator/db");
  });
});
