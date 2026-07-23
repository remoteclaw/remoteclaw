/**
 * Regression coverage for core tool allow/deny policy helpers.
 * Verifies sandbox policy resolution, explicit lists, and tool matching.
 */
import { describe, expect, it } from "vitest";
import {
  expandToolGroups,
  normalizeToolName,
  resolveToolProfilePolicy,
  TOOL_GROUPS,
} from "./tool-policy.js";

describe("tool-policy", () => {
  it("expands groups and normalizes names", () => {
    const expanded = expandToolGroups(["BASH", "group:sessions"]);
    const set = new Set(expanded);
    expect(set.has("bash")).toBe(true);
    expect(set.has("sessions_list")).toBe(true);
  });

  it("resolves known profiles and ignores unknown ones", () => {
    const coding = resolveToolProfilePolicy("coding");
    expect(coding?.allow).toContain("cron");
    expect(coding?.allow).not.toContain("gateway");
    expect(resolveToolProfilePolicy("nope")).toBeUndefined();
  });

  it("includes core tool groups in group:remoteclaw", () => {
    const group = TOOL_GROUPS["group:remoteclaw"];
    expect(group).toContain("browser");
    expect(group).toContain("message");
    expect(group).toContain("subagents");
    expect(group).toContain("session_status");
    expect(group).toContain("tts");
  });

  it("normalizes tool names", () => {
    expect(normalizeToolName(" BASH ")).toBe("bash");
    expect(normalizeToolName("READ")).toBe("read");
  });
});

// Sandbox infrastructure removed (#68) — sandbox tool policy tests removed
