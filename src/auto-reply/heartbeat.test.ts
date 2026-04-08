import { describe, expect, it } from "vitest";
import { resolveHeartbeatPrompt } from "./heartbeat.js";

describe("resolveHeartbeatPrompt", () => {
  it("returns empty string when prompt is undefined", () => {
    expect(resolveHeartbeatPrompt(undefined)).toBe("");
    expect(resolveHeartbeatPrompt()).toBe("");
  });

  it("returns empty string when prompt is empty or whitespace", () => {
    expect(resolveHeartbeatPrompt("")).toBe("");
    expect(resolveHeartbeatPrompt("   ")).toBe("");
    expect(resolveHeartbeatPrompt("  \n\t  ")).toBe("");
  });

  it("returns trimmed prompt when set", () => {
    expect(resolveHeartbeatPrompt("  ping  ")).toBe("ping");
    expect(resolveHeartbeatPrompt("Check health")).toBe("Check health");
  });

  it("returns prompt with internal whitespace preserved", () => {
    expect(resolveHeartbeatPrompt("line 1\nline 2")).toBe("line 1\nline 2");
  });
});
