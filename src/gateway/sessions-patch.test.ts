import { describe, expect, test } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import { applySessionsPatchToStore } from "./sessions-patch.js";

const SUBAGENT_MODEL = "synthetic/hf:moonshotai/Kimi-K2.5";
const KIMI_SUBAGENT_KEY = "agent:kimi:subagent:child";
const MAIN_SESSION_KEY = "agent:main:main";
const EMPTY_CFG = {} as RemoteClawConfig;

type ApplySessionsPatchArgs = Parameters<typeof applySessionsPatchToStore>[0];

async function runPatch(params: {
  patch: ApplySessionsPatchArgs["patch"];
  store?: Record<string, SessionEntry>;
  cfg?: RemoteClawConfig;
  storeKey?: string;
}) {
  return applySessionsPatchToStore({
    cfg: params.cfg ?? EMPTY_CFG,
    store: params.store ?? {},
    storeKey: params.storeKey ?? MAIN_SESSION_KEY,
    patch: params.patch,
  });
}

function expectPatchOk(
  result: Awaited<ReturnType<typeof applySessionsPatchToStore>>,
): SessionEntry {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.entry;
}

async function applySubagentModelPatch(cfg: RemoteClawConfig) {
  const res = await applySessionsPatchToStore({
    cfg,
    store: {},
    storeKey: KIMI_SUBAGENT_KEY,
    patch: {
      key: KIMI_SUBAGENT_KEY,
      model: SUBAGENT_MODEL,
    },
  });
  expect(res.ok).toBe(true);
  if (!res.ok) {
    throw new Error(res.error.message);
  }
  return res.entry;
}

function makeKimiSubagentCfg(params: {
  agentSubagentModel?: string;
  defaultsSubagentModel?: string;
}): RemoteClawConfig {
  return {
    agents: {
      defaults: {
        subagents: params.defaultsSubagentModel ? {} : undefined,
        models: {
          "anthropic/claude-sonnet-4-6": { alias: "default" },
        },
      },
      list: [
        {
          id: "kimi",
          subagents: params.agentSubagentModel ? {} : undefined,
        },
      ],
    },
  } as RemoteClawConfig;
}

describe("gateway sessions patch", () => {
  test("clears fallback notice when model patch changes", async () => {
    const store: Record<string, SessionEntry> = {
      "agent:main:main": {
        sessionId: "sess",
        updatedAt: 1,
        providerOverride: "anthropic",
        modelOverride: "claude-opus-4-5",
        fallbackNoticeSelectedModel: "anthropic/claude-opus-4-5",
        fallbackNoticeActiveModel: "openai/gpt-5.2",
        fallbackNoticeReason: "rate-limited",
      } as SessionEntry,
    };
    const res = await applySessionsPatchToStore({
      cfg: {} as RemoteClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { key: "agent:main:main", model: "openai/gpt-5.2" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.entry.providerOverride).toBe("openai");
    expect(res.entry.modelOverride).toBe("gpt-5.2");
    expect(res.entry.fallbackNoticeSelectedModel).toBeUndefined();
    expect(res.entry.fallbackNoticeActiveModel).toBeUndefined();
    expect(res.entry.fallbackNoticeReason).toBeUndefined();
  });

  test("accepts explicit allowlisted provider/model refs from sessions.patch", async () => {
    const store: Record<string, SessionEntry> = {};
    const cfg = {
      agents: {
        defaults: {
          models: {
            "anthropic/claude-sonnet-4-6": { alias: "sonnet" },
          },
        },
      },
    } as RemoteClawConfig;

    const res = await applySessionsPatchToStore({
      cfg,
      store,
      storeKey: "agent:main:main",
      patch: { key: "agent:main:main", model: "anthropic/claude-sonnet-4-6" },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.entry.providerOverride).toBe("anthropic");
    expect(res.entry.modelOverride).toBe("claude-sonnet-4-6");
  });

  test("accepts explicit allowlisted refs absent from bundled catalog", async () => {
    const store: Record<string, SessionEntry> = {};
    const cfg = {
      agents: {
        defaults: {
          models: {
            "anthropic/claude-sonnet-4-6": { alias: "sonnet" },
          },
        },
      },
    } as RemoteClawConfig;

    const res = await applySessionsPatchToStore({
      cfg,
      store,
      storeKey: "agent:main:main",
      patch: { key: "agent:main:main", model: "anthropic/claude-sonnet-4-6" },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.entry.providerOverride).toBe("anthropic");
    expect(res.entry.modelOverride).toBe("claude-sonnet-4-6");
  });

  test("sets spawnDepth for subagent sessions", async () => {
    const store: Record<string, SessionEntry> = {};
    const res = await applySessionsPatchToStore({
      cfg: {} as RemoteClawConfig,
      store,
      storeKey: "agent:main:subagent:child",
      patch: { key: "agent:main:subagent:child", spawnDepth: 2 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.entry.spawnDepth).toBe(2);
  });

  test("sets spawnedBy for ACP sessions", async () => {
    const entry = expectPatchOk(
      await runPatch({
        storeKey: "agent:main:acp:child",
        patch: {
          key: "agent:main:acp:child",
          spawnedBy: "agent:main:main",
        },
      }),
    );
    expect(entry.spawnedBy).toBe("agent:main:main");
  });

  test("sets spawnDepth for ACP sessions", async () => {
    const entry = expectPatchOk(
      await runPatch({
        storeKey: "agent:main:acp:child",
        patch: { key: "agent:main:acp:child", spawnDepth: 2 },
      }),
    );
    expect(entry.spawnDepth).toBe(2);
  });

  test("rejects spawnDepth on non-subagent sessions", async () => {
    const store: Record<string, SessionEntry> = {};
    const res = await applySessionsPatchToStore({
      cfg: {} as RemoteClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { key: "agent:main:main", spawnDepth: 1 },
    });
    expect(res.ok).toBe(false);
    if (res.ok) {
      return;
    }
    expect(res.error.message).toContain("spawnDepth is only supported");
  });

  test("normalizes send/group patches", async () => {
    const store: Record<string, SessionEntry> = {};
    const res = await applySessionsPatchToStore({
      cfg: {} as RemoteClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: {
        key: "agent:main:main",
        sendPolicy: "DENY" as unknown as "allow",
        groupActivation: "Always" as unknown as "mention",
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.entry.sendPolicy).toBe("deny");
    expect(res.entry.groupActivation).toBe("always");
  });

  test("rejects invalid sendPolicy values", async () => {
    const store: Record<string, SessionEntry> = {};
    const res = await applySessionsPatchToStore({
      cfg: {} as RemoteClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { key: "agent:main:main", sendPolicy: "ask" as unknown as "allow" },
    });
    expect(res.ok).toBe(false);
    if (res.ok) {
      return;
    }
    expect(res.error.message).toContain("invalid sendPolicy");
  });

  test("rejects invalid groupActivation values", async () => {
    const store: Record<string, SessionEntry> = {};
    const res = await applySessionsPatchToStore({
      cfg: {} as RemoteClawConfig,
      store,
      storeKey: "agent:main:main",
      patch: { key: "agent:main:main", groupActivation: "never" as unknown as "mention" },
    });
    expect(res.ok).toBe(false);
    if (res.ok) {
      return;
    }
    expect(res.error.message).toContain("invalid groupActivation");
  });

  test("allows target agent own model for subagent session even when missing from global allowlist", async () => {
    const cfg = makeKimiSubagentCfg({});

    const entry = await applySubagentModelPatch(cfg);
    // Model override is always stored when different from the global default,
    // regardless of whether it matches the target agent's own primary model.
    // CLI agents handle their own model selection.
    expect(entry.providerOverride).toBe("synthetic");
    expect(entry.modelOverride).toBe("hf:moonshotai/Kimi-K2.5");
  });

  test("allows target agent subagents.model for subagent session even when missing from global allowlist", async () => {
    const cfg = makeKimiSubagentCfg({
      agentSubagentModel: SUBAGENT_MODEL,
    });

    const entry = await applySubagentModelPatch(cfg);
    expect(entry.providerOverride).toBe("synthetic");
    expect(entry.modelOverride).toBe("hf:moonshotai/Kimi-K2.5");
  });

  test("allows global defaults.subagents.model for subagent session even when missing from global allowlist", async () => {
    const cfg = makeKimiSubagentCfg({
      defaultsSubagentModel: SUBAGENT_MODEL,
    });

    const entry = await applySubagentModelPatch(cfg);
    expect(entry.providerOverride).toBe("synthetic");
    expect(entry.modelOverride).toBe("hf:moonshotai/Kimi-K2.5");
  });
});
