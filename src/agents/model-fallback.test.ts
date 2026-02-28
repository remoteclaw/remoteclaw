import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { isAnthropicBillingError } from "./live-auth-keys.js";
import { runWithImageModelFallback, runWithModelFallback } from "./model-fallback.js";
import { makeModelFallbackCfg } from "./test-helpers/model-fallback-config-fixture.js";

const makeCfg = makeModelFallbackCfg;

function makeFallbacksOnlyCfg(): OpenClawConfig {
  return {
    agents: {
      defaults: {
        model: {
          fallbacks: ["openai/gpt-5.2"],
        },
      },
    },
  } as OpenClawConfig;
}

async function expectFallsBackToHaiku(params: {
  provider: string;
  model: string;
  firstError: Error;
}) {
  const cfg = makeCfg();
  const run = vi.fn().mockRejectedValueOnce(params.firstError).mockResolvedValueOnce("ok");

  const result = await runWithModelFallback({
    cfg,
    provider: params.provider,
    model: params.model,
    run,
  });

  expect(result.result).toBe("ok");
  expect(run).toHaveBeenCalledTimes(2);
  expect(run.mock.calls[1]?.[0]).toBe("anthropic");
  expect(run.mock.calls[1]?.[1]).toBe("claude-haiku-3-5");
}

function createOverrideFailureRun(params: {
  overrideProvider: string;
  overrideModel: string;
  fallbackProvider: string;
  fallbackModel: string;
  firstError: Error;
}) {
  return vi.fn().mockImplementation(async (provider, model) => {
    if (provider === params.overrideProvider && model === params.overrideModel) {
      throw params.firstError;
    }
    if (provider === params.fallbackProvider && model === params.fallbackModel) {
      return "ok";
    }
    throw new Error(`unexpected fallback candidate: ${provider}/${model}`);
  });
}

describe("runWithModelFallback", () => {
  it("normalizes openai gpt-5.3 codex to openai-codex before running", async () => {
    const cfg = makeCfg();
    const run = vi.fn().mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "openai",
      model: "gpt-5.3-codex",
      run,
    });

    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("openai-codex", "gpt-5.3-codex");
  });

  it("falls back on unrecognized errors when candidates remain", async () => {
    const cfg = makeCfg();
    const run = vi.fn().mockRejectedValueOnce(new Error("bad request")).mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "openai",
      model: "gpt-4.1-mini",
      run,
    });
    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].error).toBe("bad request");
    expect(result.attempts[0].reason).toBe("unknown");
  });

  it("passes original unknown errors to onError during fallback", async () => {
    const cfg = makeCfg();
    const unknownError = new Error("provider misbehaved");
    const run = vi.fn().mockRejectedValueOnce(unknownError).mockResolvedValueOnce("ok");
    const onError = vi.fn();

    await runWithModelFallback({
      cfg,
      provider: "openai",
      model: "gpt-4.1-mini",
      run,
      onError,
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      provider: "openai",
      model: "gpt-4.1-mini",
      attempt: 1,
      total: 2,
    });
    expect(onError.mock.calls[0]?.[0]?.error).toBe(unknownError);
  });

  it("throws unrecognized error on last candidate", async () => {
    const cfg = makeCfg();
    const run = vi.fn().mockRejectedValueOnce(new Error("something weird"));

    await expect(
      runWithModelFallback({
        cfg,
        provider: "openai",
        model: "gpt-4.1-mini",
        run,
        fallbacksOverride: [],
      }),
    ).rejects.toThrow("something weird");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("falls back on auth errors", async () => {
    await expectFallsBackToHaiku({
      provider: "openai",
      model: "gpt-4.1-mini",
      firstError: Object.assign(new Error("nope"), { status: 401 }),
    });
  });

  it("falls back directly to configured primary when an override model fails", async () => {
    const cfg = makeCfg({
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-4.1-mini",
            fallbacks: ["anthropic/claude-haiku-3-5", "openrouter/deepseek-chat"],
          },
        },
      },
    });

    const run = createOverrideFailureRun({
      overrideProvider: "anthropic",
      overrideModel: "claude-opus-4-5",
      fallbackProvider: "openai",
      fallbackModel: "gpt-4.1-mini",
      firstError: Object.assign(new Error("unauthorized"), { status: 401 }),
    });

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-opus-4-5",
      run,
    });

    expect(result.result).toBe("ok");
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4.1-mini");
    expect(run.mock.calls).toEqual([
      ["anthropic", "claude-opus-4-5"],
      ["openai", "gpt-4.1-mini"],
    ]);
  });

  it("keeps configured fallback chain when current model is a configured fallback", async () => {
    const cfg = makeCfg({
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-4.1-mini",
            fallbacks: ["anthropic/claude-haiku-3-5", "openrouter/deepseek-chat"],
          },
        },
      },
    });

    const run = vi.fn().mockImplementation(async (provider: string, model: string) => {
      if (provider === "anthropic" && model === "claude-haiku-3-5") {
        throw Object.assign(new Error("rate-limited"), { status: 429 });
      }
      if (provider === "openrouter" && model === "openrouter/deepseek-chat") {
        return "ok";
      }
      throw new Error(`unexpected fallback candidate: ${provider}/${model}`);
    });

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-haiku-3-5",
      run,
    });

    expect(result.result).toBe("ok");
    expect(result.provider).toBe("openrouter");
    expect(result.model).toBe("openrouter/deepseek-chat");
    expect(run.mock.calls).toEqual([
      ["anthropic", "claude-haiku-3-5"],
      ["openrouter", "openrouter/deepseek-chat"],
    ]);
  });

  it("treats normalized default refs as primary and keeps configured fallback chain", async () => {
    const cfg = makeCfg({
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-4.1-mini",
            fallbacks: ["anthropic/claude-haiku-3-5"],
          },
        },
      },
    });

    const run = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("nope"), { status: 401 }))
      .mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: " OpenAI ",
      model: "gpt-4.1-mini",
      run,
    });

    expect(result.result).toBe("ok");
    expect(run.mock.calls).toEqual([
      ["openai", "gpt-4.1-mini"],
      ["anthropic", "claude-haiku-3-5"],
    ]);
  });

  it("falls back on transient HTTP 5xx errors", async () => {
    await expectFallsBackToHaiku({
      provider: "openai",
      model: "gpt-4.1-mini",
      firstError: new Error(
        "521 <!DOCTYPE html><html><head><title>Web server is down</title></head><body>Cloudflare</body></html>",
      ),
    });
  });

  it("falls back on 402 payment required", async () => {
    await expectFallsBackToHaiku({
      provider: "openai",
      model: "gpt-4.1-mini",
      firstError: Object.assign(new Error("payment required"), { status: 402 }),
    });
  });

  it("falls back on billing errors", async () => {
    await expectFallsBackToHaiku({
      provider: "openai",
      model: "gpt-4.1-mini",
      firstError: new Error(
        "LLM request rejected: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
      ),
    });
  });

  it("falls back to configured primary for override credential validation errors", async () => {
    const cfg = makeCfg();
    const run = createOverrideFailureRun({
      overrideProvider: "anthropic",
      overrideModel: "claude-opus-4",
      fallbackProvider: "openai",
      fallbackModel: "gpt-4.1-mini",
      firstError: new Error('No credentials found for profile "anthropic:default".'),
    });

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-opus-4",
      run,
    });

    expect(result.result).toBe("ok");
    expect(run.mock.calls).toEqual([
      ["anthropic", "claude-opus-4"],
      ["openai", "gpt-4.1-mini"],
    ]);
  });

  it("falls back on unknown model errors", async () => {
    const cfg = makeCfg();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unknown model: anthropic/claude-opus-4-6"))
      .mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-opus-4-6",
      run,
    });

    // Override model failed with model_not_found → falls back to configured primary.
    // (Same candidate-resolution path as other override-model failures.)
    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]?.[0]).toBe("openai");
    expect(run.mock.calls[1]?.[1]).toBe("gpt-4.1-mini");
  });

  it("falls back on model not found errors", async () => {
    const cfg = makeCfg();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("Model not found: openai/gpt-6"))
      .mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "openai",
      model: "gpt-6",
      run,
    });

    // Override model failed with model_not_found → falls back to configured primary.
    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]?.[0]).toBe("openai");
    expect(run.mock.calls[1]?.[1]).toBe("gpt-4.1-mini");
  });

  it("does not append configured primary when fallbacksOverride is set", async () => {
    const cfg = makeCfg({
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-4.1-mini",
          },
        },
      },
    });
    const run = vi
      .fn()
      .mockImplementation(() => Promise.reject(Object.assign(new Error("nope"), { status: 401 })));

    await expect(
      runWithModelFallback({
        cfg,
        provider: "anthropic",
        model: "claude-opus-4-5",
        fallbacksOverride: ["anthropic/claude-haiku-3-5"],
        run,
      }),
    ).rejects.toThrow("All models failed");

    expect(run.mock.calls).toEqual([
      ["anthropic", "claude-opus-4-5"],
      ["anthropic", "claude-haiku-3-5"],
    ]);
  });

  it("uses fallbacksOverride instead of agents.defaults.model.fallbacks", async () => {
    const cfg = makeFallbacksOnlyCfg();

    const calls: Array<{ provider: string; model: string }> = [];

    const res = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-opus-4-5",
      fallbacksOverride: ["openai/gpt-4.1"],
      run: async (provider, model) => {
        calls.push({ provider, model });
        if (provider === "anthropic") {
          throw Object.assign(new Error("nope"), { status: 401 });
        }
        if (provider === "openai" && model === "gpt-4.1") {
          return "ok";
        }
        throw new Error(`unexpected candidate: ${provider}/${model}`);
      },
    });

    expect(res.result).toBe("ok");
    expect(calls).toEqual([
      { provider: "anthropic", model: "claude-opus-4-5" },
      { provider: "openai", model: "gpt-4.1" },
    ]);
  });

  it("treats an empty fallbacksOverride as disabling global fallbacks", async () => {
    const cfg = makeFallbacksOnlyCfg();

    const calls: Array<{ provider: string; model: string }> = [];

    await expect(
      runWithModelFallback({
        cfg,
        provider: "anthropic",
        model: "claude-opus-4-5",
        fallbacksOverride: [],
        run: async (provider, model) => {
          calls.push({ provider, model });
          throw new Error("primary failed");
        },
      }),
    ).rejects.toThrow("primary failed");

    expect(calls).toEqual([{ provider: "anthropic", model: "claude-opus-4-5" }]);
  });

  it("keeps explicit fallbacks reachable when models allowlist is present", async () => {
    const cfg = makeCfg({
      agents: {
        defaults: {
          model: {
            primary: "anthropic/claude-sonnet-4",
            fallbacks: ["openai/gpt-4o", "ollama/llama-3"],
          },
          models: {
            "anthropic/claude-sonnet-4": {},
          },
        },
      },
    });
    const run = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "anthropic",
      model: "claude-sonnet-4",
      run,
    });

    expect(result.result).toBe("ok");
    expect(run.mock.calls).toEqual([
      ["anthropic", "claude-sonnet-4"],
      ["openai", "gpt-4o"],
    ]);
  });

  it("defaults provider/model when missing (regression #946)", async () => {
    const cfg = makeCfg({
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-4.1-mini",
            fallbacks: [],
          },
        },
      },
    });

    const calls: Array<{ provider: string; model: string }> = [];

    const result = await runWithModelFallback({
      cfg,
      provider: undefined as unknown as string,
      model: undefined as unknown as string,
      run: async (provider, model) => {
        calls.push({ provider, model });
        return "ok";
      },
    });

    expect(result.result).toBe("ok");
    expect(calls).toEqual([{ provider: "openai", model: "gpt-4.1-mini" }]);
  });

  it("falls back on missing API key errors", async () => {
    await expectFallsBackToHaiku({
      provider: "openai",
      model: "gpt-4.1-mini",
      firstError: new Error("No API key found for profile openai."),
    });
  });

  it("falls back on lowercase credential errors", async () => {
    await expectFallsBackToHaiku({
      provider: "openai",
      model: "gpt-4.1-mini",
      firstError: new Error("no api key found for profile openai"),
    });
  });

  it("falls back on timeout abort errors", async () => {
    const timeoutCause = Object.assign(new Error("request timed out"), { name: "TimeoutError" });
    await expectFallsBackToHaiku({
      provider: "openai",
      model: "gpt-4.1-mini",
      firstError: Object.assign(new Error("aborted"), { name: "AbortError", cause: timeoutCause }),
    });
  });

  it("falls back on abort errors with timeout reasons", async () => {
    await expectFallsBackToHaiku({
      provider: "openai",
      model: "gpt-4.1-mini",
      firstError: Object.assign(new Error("aborted"), {
        name: "AbortError",
        reason: "deadline exceeded",
      }),
    });
  });

  it("falls back on abort errors with reason: abort", async () => {
    await expectFallsBackToHaiku({
      provider: "openai",
      model: "gpt-4.1-mini",
      firstError: Object.assign(new Error("aborted"), {
        name: "AbortError",
        reason: "reason: abort",
      }),
    });
  });

  it("falls back when message says aborted but error is a timeout", async () => {
    await expectFallsBackToHaiku({
      provider: "openai",
      model: "gpt-4.1-mini",
      firstError: Object.assign(new Error("request aborted"), { code: "ETIMEDOUT" }),
    });
  });

  it("falls back on provider abort errors with request-aborted messages", async () => {
    await expectFallsBackToHaiku({
      provider: "openai",
      model: "gpt-4.1-mini",
      firstError: Object.assign(new Error("Request was aborted"), { name: "AbortError" }),
    });
  });

  it("does not fall back on user aborts", async () => {
    const cfg = makeCfg();
    const run = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }))
      .mockResolvedValueOnce("ok");

    await expect(
      runWithModelFallback({
        cfg,
        provider: "openai",
        model: "gpt-4.1-mini",
        run,
      }),
    ).rejects.toThrow("aborted");

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("appends the configured primary as a last fallback", async () => {
    const cfg = makeCfg({
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-4.1-mini",
            fallbacks: [],
          },
        },
      },
    });
    const run = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }))
      .mockResolvedValueOnce("ok");

    const result = await runWithModelFallback({
      cfg,
      provider: "openrouter",
      model: "meta-llama/llama-3.3-70b:free",
      run,
    });

    expect(result.result).toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4.1-mini");
  });
});

describe("runWithImageModelFallback", () => {
  it("keeps explicit image fallbacks reachable when models allowlist is present", async () => {
    const cfg = makeCfg({
      agents: {
        defaults: {
          imageModel: {
            primary: "openai/gpt-image-1",
            fallbacks: ["google/gemini-2.5-flash-image-preview"],
          },
          models: {
            "openai/gpt-image-1": {},
          },
        },
      },
    });
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce("ok");

    const result = await runWithImageModelFallback({
      cfg,
      run,
    });

    expect(result.result).toBe("ok");
    expect(run.mock.calls).toEqual([
      ["openai", "gpt-image-1"],
      ["google", "gemini-2.5-flash-image-preview"],
    ]);
  });
});

describe("isAnthropicBillingError", () => {
  it("does not false-positive on plain 'a 402' prose", () => {
    const samples = [
      "Use a 402 stainless bolt",
      "Book a 402 room",
      "There is a 402 near me",
      "The building at 402 Main Street",
    ];

    for (const sample of samples) {
      expect(isAnthropicBillingError(sample)).toBe(false);
    }
  });

  it("matches real 402 billing payload contexts including JSON keys", () => {
    const samples = [
      "HTTP 402 Payment Required",
      "status: 402",
      "error code 402",
      '{"status":402,"type":"error"}',
      '{"code":402,"message":"payment required"}',
      '{"error":{"code":402,"message":"billing hard limit reached"}}',
      "got a 402 from the API",
      "returned 402",
      "received a 402 response",
    ];

    for (const sample of samples) {
      expect(isAnthropicBillingError(sample)).toBe(true);
    }
  });
});
