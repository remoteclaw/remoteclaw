import { describe, expect, it } from "vitest";
import { applyModelDefaults } from "./defaults.js";
import type { AgentDefaultsConfig } from "./types.agent-defaults.js";
import type { RemoteClawConfig } from "./types.js";

describe("applyModelDefaults", () => {
  it("adds default aliases when models are present", () => {
    const cfg = {
      agents: {
        defaults: {
          models: {
            "anthropic/claude-opus-4-6": {},
            "openai/gpt-5.2": {},
          },
        } as AgentDefaultsConfig,
      },
    } satisfies RemoteClawConfig;
    const next = applyModelDefaults(cfg);
    const models = (next.agents?.defaults as Record<string, unknown>)?.models as
      | Record<string, Record<string, unknown>>
      | undefined;

    expect(models?.["anthropic/claude-opus-4-6"]?.alias).toBe("opus");
    expect(models?.["openai/gpt-5.2"]?.alias).toBe("gpt");
  });

  it("does not override existing aliases", () => {
    const cfg = {
      agents: {
        defaults: {
          models: {
            "anthropic/claude-opus-4-5": { alias: "Opus" },
          },
        } as AgentDefaultsConfig,
      },
    } satisfies RemoteClawConfig;

    const next = applyModelDefaults(cfg);
    const models = (next.agents?.defaults as Record<string, unknown>)?.models as
      | Record<string, Record<string, unknown>>
      | undefined;

    expect(models?.["anthropic/claude-opus-4-5"]?.alias).toBe("Opus");
  });

  it("respects explicit empty alias disables", () => {
    const cfg = {
      agents: {
        defaults: {
          models: {
            "google/gemini-3-pro-preview": { alias: "" },
            "google/gemini-3-flash-preview": {},
          },
        } as AgentDefaultsConfig,
      },
    } satisfies RemoteClawConfig;

    const next = applyModelDefaults(cfg);
    const models = (next.agents?.defaults as Record<string, unknown>)?.models as
      | Record<string, Record<string, unknown>>
      | undefined;

    expect(models?.["google/gemini-3-pro-preview"]?.alias).toBe("");
    expect(models?.["google/gemini-3-flash-preview"]?.alias).toBe("gemini-flash");
  });
});
