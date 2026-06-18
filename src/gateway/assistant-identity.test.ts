import { describe, expect, it } from "vitest";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import type { RemoteClawConfig } from "../config/config.js";
import { DEFAULT_ASSISTANT_IDENTITY, resolveAssistantIdentity } from "./assistant-identity.js";

describe("resolveAssistantIdentity avatar normalization", () => {
  it("drops sentence-like avatar placeholders", () => {
    const cfg: RemoteClawConfig = {
      ui: {
        assistant: {
          avatar: "workspace-relative path, http(s) URL, or data URI",
        },
      },
    };

    expect(resolveAssistantIdentity({ cfg, workspaceDir: "/tmp/remoteclaw-test" }).avatar).toBe(
      DEFAULT_ASSISTANT_IDENTITY.avatar,
    );
  });

  it("keeps short text avatars", () => {
    const cfg: RemoteClawConfig = {
      ui: {
        assistant: {
          avatar: "PS",
        },
      },
    };

    expect(resolveAssistantIdentity({ cfg, workspaceDir: "/tmp/remoteclaw-test" }).avatar).toBe(
      "PS",
    );
  });

  it("keeps path avatars", () => {
    const cfg: RemoteClawConfig = {
      ui: {
        assistant: {
          avatar: "avatars/remoteclaw.png",
        },
      },
    };

    expect(resolveAssistantIdentity({ cfg, workspaceDir: "/tmp/remoteclaw-test" }).avatar).toBe(
      "avatars/remoteclaw.png",
    );
  });
});

describe("resolveAssistantIdentity canonical default-agent id (#2724)", () => {
  it("DEFAULT_ASSISTANT_IDENTITY.agentId derives from the single canonical source", () => {
    // Pins the fallback identity's agent id to resolveDefaultAgentId's no-config
    // result ("default") — not a hardcoded literal — and guards against the
    // eliminated phantom "main" agent ever being reintroduced here.
    expect(DEFAULT_ASSISTANT_IDENTITY.agentId).toBe(resolveDefaultAgentId({}));
    expect(DEFAULT_ASSISTANT_IDENTITY.agentId).toBe("default");
    expect(DEFAULT_ASSISTANT_IDENTITY.agentId).not.toBe("main");
  });

  it("resolves to the canonical default when no agents are configured", () => {
    const cfg: RemoteClawConfig = {};
    expect(resolveAssistantIdentity({ cfg }).agentId).toBe(resolveDefaultAgentId(cfg));
    expect(resolveAssistantIdentity({ cfg }).agentId).toBe("default");
  });

  it("uses the first listed agent when none is marked default", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          { id: "alpha", workspace: "~/alpha" },
          { id: "beta", workspace: "~/beta" },
        ],
      },
    };
    expect(resolveAssistantIdentity({ cfg }).agentId).toBe("alpha");
    expect(resolveAssistantIdentity({ cfg }).agentId).toBe(resolveDefaultAgentId(cfg));
  });

  it("honors a non-first agent marked default:true (routes through resolveDefaultAgentId)", () => {
    // The previous inline `listAgentEntries(cfg)[0]?.id` fallback returned the
    // FIRST listed agent and ignored the `default` flag. Routing through the
    // canonical resolver now correctly selects the default-marked agent.
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          { id: "first", workspace: "~/first" },
          { id: "second", workspace: "~/second", default: true },
        ],
      },
    };
    expect(resolveAssistantIdentity({ cfg }).agentId).toBe("second");
    expect(resolveAssistantIdentity({ cfg }).agentId).toBe(resolveDefaultAgentId(cfg));
  });

  it("an explicit agentId param still wins and is normalized", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "configured", workspace: "~/c", default: true }] },
    };
    expect(resolveAssistantIdentity({ cfg, agentId: "Override" }).agentId).toBe("override");
  });
});
