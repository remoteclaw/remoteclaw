import { describe, expect, it, vi } from "vitest";
import type { AuthProfileStore } from "../auth/types.js";
import type { RemoteClawConfig } from "../config/config.js";
import { withAuthKeyRetry } from "./auth-key-retry.js";

vi.mock("../auth/store.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../auth/store.js")>();
  return {
    ...original,
    updateAuthProfileStoreWithLock: vi.fn().mockResolvedValue(null),
    saveAuthProfileStore: vi.fn(),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────

type FakeResult = { text: string; error?: string };

const makeStore = (
  profiles: Record<string, { provider: string; key: string }>,
): AuthProfileStore => ({
  version: 1,
  profiles: Object.fromEntries(
    Object.entries(profiles).map(([id, p]) => [
      id,
      { type: "api_key" as const, provider: p.provider, key: p.key },
    ]),
  ),
});

const multiKeyCfg: RemoteClawConfig = {
  agents: {
    list: [
      {
        id: "main",
        workspace: "~/w",
        auth: ["anthropic:key1", "anthropic:key2", "anthropic:key3"],
      },
    ],
  },
};

function freshMultiKeyStore(): AuthProfileStore {
  return makeStore({
    "anthropic:key1": { provider: "anthropic", key: "sk-1" },
    "anthropic:key2": { provider: "anthropic", key: "sk-2" },
    "anthropic:key3": { provider: "anthropic", key: "sk-3" },
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("withAuthKeyRetry", () => {
  it("rate-limit error with multi-key config triggers retry with next key", async () => {
    const envsSeen: Record<string, string>[] = [];
    let callCount = 0;
    const store = freshMultiKeyStore();

    const result = await withAuthKeyRetry<FakeResult>(
      { cfg: multiKeyCfg, agentId: "main", baseEnv: {}, store },
      async (env) => {
        envsSeen.push({ ...env });
        callCount++;
        if (callCount === 1) {
          throw new Error("rate limit exceeded");
        }
        return { text: "ok" };
      },
      (r) => r.error,
    );

    expect(callCount).toBe(2);
    expect(result.text).toBe("ok");
    // First call uses key1, second uses key2 (round-robin via lastUsed ordering)
    expect(envsSeen[0]).toEqual({ ANTHROPIC_API_KEY: "sk-1" });
    expect(envsSeen[1]).toEqual({ ANTHROPIC_API_KEY: "sk-2" });
  });

  it("retry succeeds with second key — normal response returned", async () => {
    let callCount = 0;
    const store = freshMultiKeyStore();

    const result = await withAuthKeyRetry<FakeResult>(
      { cfg: multiKeyCfg, agentId: "main", baseEnv: {}, store },
      async () => {
        callCount++;
        if (callCount === 1) {
          // Return result with error (not thrown) — e.g. partial failure
          return { text: "", error: "429 Too Many Requests" };
        }
        return { text: "success from key2" };
      },
      (r) => r.error,
    );

    expect(result.text).toBe("success from key2");
    expect(result.error).toBeUndefined();
  });

  it("all keys fail — error surfaced to user", async () => {
    let callCount = 0;
    const store = freshMultiKeyStore();

    const result = await withAuthKeyRetry<FakeResult>(
      { cfg: multiKeyCfg, agentId: "main", baseEnv: {}, store },
      async () => {
        callCount++;
        return { text: "", error: "rate limit exceeded" };
      },
      (r) => r.error,
    );

    // All 3 keys attempted, last error result returned
    expect(callCount).toBe(3);
    expect(result.error).toBe("rate limit exceeded");
  });

  it("all keys fail with thrown errors — last error re-thrown", async () => {
    let callCount = 0;
    const store = freshMultiKeyStore();

    await expect(
      withAuthKeyRetry<FakeResult>(
        { cfg: multiKeyCfg, agentId: "main", baseEnv: {}, store },
        async () => {
          callCount++;
          throw new Error("HTTP 401 Unauthorized");
        },
        (r) => r.error,
      ),
    ).rejects.toThrow("HTTP 401 Unauthorized");

    expect(callCount).toBe(3);
  });

  it("single key config — no retry attempted", async () => {
    const singleKeyCfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/w", auth: "anthropic:key1" }],
      },
    };
    const store = freshMultiKeyStore();
    let callCount = 0;

    await expect(
      withAuthKeyRetry<FakeResult>(
        { cfg: singleKeyCfg, agentId: "main", baseEnv: {}, store },
        async () => {
          callCount++;
          throw new Error("rate limit exceeded");
        },
        (r) => r.error,
      ),
    ).rejects.toThrow("rate limit exceeded");

    expect(callCount).toBe(1);
  });

  it("auth: false — no retry attempted", async () => {
    const noAuthCfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/w", auth: false }],
      },
    };
    const store = freshMultiKeyStore();
    let callCount = 0;

    await expect(
      withAuthKeyRetry<FakeResult>(
        { cfg: noAuthCfg, agentId: "main", baseEnv: {}, store },
        async () => {
          callCount++;
          throw new Error("rate limit exceeded");
        },
        (r) => r.error,
      ),
    ).rejects.toThrow("rate limit exceeded");

    expect(callCount).toBe(1);
  });

  it("retry count never exceeds number of configured keys", async () => {
    const twoKeyCfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/w", auth: ["anthropic:key1", "anthropic:key2"] }],
      },
    };
    const twoKeyStore = makeStore({
      "anthropic:key1": { provider: "anthropic", key: "sk-1" },
      "anthropic:key2": { provider: "anthropic", key: "sk-2" },
    });
    let callCount = 0;

    const result = await withAuthKeyRetry<FakeResult>(
      { cfg: twoKeyCfg, agentId: "main", baseEnv: {}, store: twoKeyStore },
      async () => {
        callCount++;
        return { text: "", error: "quota exceeded" };
      },
      (r) => r.error,
    );

    // Exactly 2 attempts (one per key), not more
    expect(callCount).toBe(2);
    expect(result.error).toBe("quota exceeded");
  });

  it("non-rotatable errors are not retried", async () => {
    let callCount = 0;
    const store = freshMultiKeyStore();

    await expect(
      withAuthKeyRetry<FakeResult>(
        { cfg: multiKeyCfg, agentId: "main", baseEnv: {}, store },
        async () => {
          callCount++;
          throw new Error("context length exceeded");
        },
        (r) => r.error,
      ),
    ).rejects.toThrow("context length exceeded");

    // Only one attempt — context overflow is not auth-rotatable
    expect(callCount).toBe(1);
  });

  it("merges auth env with base env", async () => {
    let capturedEnv: Record<string, string> | undefined;
    const store = freshMultiKeyStore();

    await withAuthKeyRetry<FakeResult>(
      {
        cfg: multiKeyCfg,
        agentId: "main",
        baseEnv: { NODE_ENV: "test", EXISTING: "value" },
        store,
      },
      async (env) => {
        capturedEnv = env;
        return { text: "ok" };
      },
      (r) => r.error,
    );

    expect(capturedEnv).toEqual({
      NODE_ENV: "test",
      EXISTING: "value",
      ANTHROPIC_API_KEY: "sk-1",
    });
  });

  it("passes base env when no auth is configured", async () => {
    const noAuthCfg: RemoteClawConfig = {};
    let capturedEnv: Record<string, string> | undefined;

    await withAuthKeyRetry<FakeResult>(
      { cfg: noAuthCfg, agentId: "main", baseEnv: { BASE: "env" } },
      async (env) => {
        capturedEnv = env;
        return { text: "ok" };
      },
      (r) => r.error,
    );

    expect(capturedEnv).toEqual({ BASE: "env" });
  });
});
