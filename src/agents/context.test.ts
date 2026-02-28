import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_CONTEXT_1M_TOKENS,
  applyDiscoveredContextWindows,
  resolveContextTokensForModel,
} from "./context.js";
import { createSessionManagerRuntimeRegistry } from "./pi-extensions/session-manager-runtime-registry.js";

describe("applyDiscoveredContextWindows", () => {
  it("keeps the smallest context window when duplicate model ids are discovered", () => {
    const cache = new Map<string, number>();
    applyDiscoveredContextWindows({
      cache,
      models: [
        { id: "claude-sonnet-4-5", contextWindow: 1_000_000 },
        { id: "claude-sonnet-4-5", contextWindow: 200_000 },
      ],
    });

    expect(cache.get("claude-sonnet-4-5")).toBe(200_000);
  });
});

describe("createSessionManagerRuntimeRegistry", () => {
  it("stores, reads, and clears values by object identity", () => {
    const registry = createSessionManagerRuntimeRegistry<{ value: number }>();
    const key = {};
    expect(registry.get(key)).toBeNull();
    registry.set(key, { value: 1 });
    expect(registry.get(key)).toEqual({ value: 1 });
    registry.set(key, null);
    expect(registry.get(key)).toBeNull();
  });

  it("ignores non-object keys", () => {
    const registry = createSessionManagerRuntimeRegistry<{ value: number }>();
    registry.set(null, { value: 1 });
    registry.set(123, { value: 1 });
    expect(registry.get(null)).toBeNull();
    expect(registry.get(123)).toBeNull();
  });
});

describe("resolveContextTokensForModel", () => {
  it("returns 1M context when anthropic context1m is enabled for opus/sonnet", () => {
    const result = resolveContextTokensForModel({
      cfg: {
        agents: {
          defaults: {
            models: {
              "anthropic/claude-opus-4-6": {
                params: { context1m: true },
              },
            },
          },
        },
      },
      provider: "anthropic",
      model: "claude-opus-4-6",
      fallbackContextTokens: 200_000,
    });

    expect(result).toBe(ANTHROPIC_CONTEXT_1M_TOKENS);
  });

  it("does not force 1M context for non-opus/sonnet Anthropic models", () => {
    const result = resolveContextTokensForModel({
      cfg: {
        agents: {
          defaults: {
            models: {
              "anthropic/claude-haiku-3-5": {
                params: { context1m: true },
              },
            },
          },
        },
      },
      provider: "anthropic",
      model: "claude-haiku-3-5",
      fallbackContextTokens: 200_000,
    });

    expect(result).toBe(200_000);
  });
});
