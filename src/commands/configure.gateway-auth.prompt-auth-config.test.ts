import { describe, expect, it, vi } from "vitest";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";

const mocks = vi.hoisted(() => ({
  promptAuthChoiceGrouped: vi.fn(),
  applyAuthChoice: vi.fn(),
  promptCustomApiConfig: vi.fn(),
}));

vi.mock("../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore: vi.fn(() => ({
    version: 1,
    profiles: {},
  })),
}));

vi.mock("./auth-choice-prompt.js", () => ({
  promptAuthChoiceGrouped: mocks.promptAuthChoiceGrouped,
}));

vi.mock("./auth-choice.js", () => ({
  applyAuthChoice: mocks.applyAuthChoice,
}));

vi.mock("./onboard-custom.js", () => ({
  promptCustomApiConfig: mocks.promptCustomApiConfig,
}));

import { promptAuthConfig } from "./configure.gateway-auth.js";

function makeRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  };
}

const noopPrompter = {} as WizardPrompter;

describe("promptAuthConfig", () => {
  it("passes through agent config from applyAuthChoice", async () => {
    mocks.promptAuthChoiceGrouped.mockResolvedValue("kilocode-api-key");
    mocks.applyAuthChoice.mockResolvedValue({
      config: {
        agents: {
          defaults: {
            model: { primary: "kilocode/anthropic/claude-opus-4.6" },
          },
        },
      },
    });

    const result = await promptAuthConfig({}, makeRuntime(), noopPrompter);
    expect(resolveAgentModelPrimaryValue(result.agents?.defaults?.model)).toBe(
      "kilocode/anthropic/claude-opus-4.6",
    );
  });

  it("does not mutate agent defaults", async () => {
    mocks.promptAuthChoiceGrouped.mockResolvedValue("kilocode-api-key");
    mocks.applyAuthChoice.mockResolvedValue({
      config: {
        agents: {
          defaults: {
            model: { primary: "kilocode/anthropic/claude-opus-4.6" },
          },
        },
      },
    });

    const result = await promptAuthConfig({}, makeRuntime(), noopPrompter);
    expect(resolveAgentModelPrimaryValue(result.agents?.defaults?.model)).toBe(
      "kilocode/anthropic/claude-opus-4.6",
    );
  });
});
