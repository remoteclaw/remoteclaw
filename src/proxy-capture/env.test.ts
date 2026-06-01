import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REMOTECLAW_DEBUG_PROXY_ENABLED,
  REMOTECLAW_DEBUG_PROXY_SESSION_ID,
  resolveDebugProxySettings,
} from "./env.js";

describe("resolveDebugProxySettings", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("keeps an implicit debug proxy session id stable within one process", async () => {
    const mod = await import("./env.js");
    const env = {
      [REMOTECLAW_DEBUG_PROXY_ENABLED]: "1",
    } satisfies NodeJS.ProcessEnv;

    const first = mod.resolveDebugProxySettings(env);
    const second = mod.resolveDebugProxySettings(env);

    expect(first.sessionId).toBe(second.sessionId);
  });

  it("prefers an explicit session id from the environment", () => {
    const settings = resolveDebugProxySettings({
      [REMOTECLAW_DEBUG_PROXY_ENABLED]: "1",
      [REMOTECLAW_DEBUG_PROXY_SESSION_ID]: "session-explicit",
    });

    expect(settings.sessionId).toBe("session-explicit");
  });
});
