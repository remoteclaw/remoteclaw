import { describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

vi.mock("../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore: vi.fn(() => ({
    version: 1,
    profiles: {},
  })),
  upsertAuthProfile: vi.fn(),
}));

import { promptAuthConfig } from "./configure.gateway-auth.js";

function makeRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  };
}

function makePrompter(overrides?: { selectValue?: string; textValue?: string }): WizardPrompter {
  return {
    select: vi.fn().mockResolvedValue(overrides?.selectValue ?? "claude"),
    text: vi.fn().mockResolvedValue(overrides?.textValue ?? ""),
    confirm: vi.fn().mockResolvedValue(true),
    password: vi.fn().mockResolvedValue(""),
    group: vi.fn(),
    note: vi.fn(),
  } as unknown as WizardPrompter;
}

describe("promptAuthConfig", () => {
  it("sets selected runtime in agent defaults", async () => {
    const prompter = makePrompter({ selectValue: "claude" });
    const result = await promptAuthConfig({}, makeRuntime(), prompter);
    expect(result.agents?.defaults?.runtime).toBe("claude");
  });

  it("does not mutate agent defaults from input config", async () => {
    const prompter = makePrompter({ selectValue: "gemini" });
    const inputCfg = { agents: { defaults: { runtime: "claude" as const } } };
    const result = await promptAuthConfig(inputCfg, makeRuntime(), prompter);
    expect(result.agents?.defaults?.runtime).toBe("gemini");
    // Original config unchanged
    expect(inputCfg.agents.defaults.runtime).toBe("claude");
  });
});
