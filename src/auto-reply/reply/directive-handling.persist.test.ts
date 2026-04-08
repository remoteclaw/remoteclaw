import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../../config/config.js";
import { resolveDefaultModel } from "./directive-handling.persist.js";

describe("resolveDefaultModel", () => {
  it("returns configured runtime as defaultProvider", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtime: "claude" },
      },
    };
    const result = resolveDefaultModel({ cfg, agentId: "main" });
    expect(result.defaultProvider).toBe("claude");
  });

  it("returns per-agent runtime when configured", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "gemini-agent", runtime: "gemini", workspace: "~/ws" }],
      },
    };
    const result = resolveDefaultModel({ cfg, agentId: "gemini-agent" });
    expect(result.defaultProvider).toBe("gemini");
  });

  it("falls back to defaults.runtime when agent has no runtime override", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtime: "codex" },
        list: [{ id: "my-agent", workspace: "~/ws" }],
      },
    };
    const result = resolveDefaultModel({ cfg, agentId: "my-agent" });
    expect(result.defaultProvider).toBe("codex");
  });

  it("falls back to 'unknown' when no runtime is configured", () => {
    const cfg: RemoteClawConfig = {};
    const result = resolveDefaultModel({ cfg });
    expect(result.defaultProvider).toBe("unknown");
  });

  it("uses defaults.runtime when agentId is not provided", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtime: "opencode" },
      },
    };
    const result = resolveDefaultModel({ cfg });
    expect(result.defaultProvider).toBe("opencode");
  });

  it("returns an empty aliasIndex", () => {
    const cfg: RemoteClawConfig = {
      agents: { defaults: { runtime: "claude" } },
    };
    const result = resolveDefaultModel({ cfg });
    expect(result.aliasIndex.size).toBe(0);
  });
});
