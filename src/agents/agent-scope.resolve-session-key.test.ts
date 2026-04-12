import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";

// Legacy session-key alias (no "agent:" prefix). Pre-#2308 this was the
// implicit default DM session key; post-elimination it is just a legacy alias
// string that resolvers fall back on.
const LEGACY_ALIAS = "main";

const { warnMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
}));

vi.mock("../logging/subsystem.js", () => {
  const makeLogger = () => ({
    subsystem: "agents/scope",
    isEnabled: () => true,
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: warnMock,
    error: vi.fn(),
    fatal: vi.fn(),
    raw: vi.fn(),
    child: () => makeLogger(),
  });
  return { createSubsystemLogger: () => makeLogger() };
});

import { resolveSessionKeyAgentId } from "./agent-scope.js";

describe("resolveSessionKeyAgentId", () => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  describe("valid agent: prefix keys", () => {
    it("returns parsed agent ID from canonical key", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "main" }, { id: "work" }] },
      };
      expect(resolveSessionKeyAgentId("agent:work:main", cfg)).toBe("work");
      expect(warnMock).not.toHaveBeenCalled();
    });

    it("normalizes agent ID case", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "Main" }] },
      };
      expect(resolveSessionKeyAgentId("AGENT:Main:session", cfg)).toBe(LEGACY_ALIAS);
      expect(warnMock).not.toHaveBeenCalled();
    });
  });

  describe("single-agent + legacy key", () => {
    it("infers sole agent seamlessly without warning", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "home" }] },
      };
      expect(resolveSessionKeyAgentId(LEGACY_ALIAS, cfg)).toBe("home");
      expect(warnMock).not.toHaveBeenCalled();
    });

    it("infers sole agent for channel-style legacy keys", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "ops" }] },
      };
      expect(resolveSessionKeyAgentId("discord:direct:user123", cfg)).toBe("ops");
      expect(warnMock).not.toHaveBeenCalled();
    });
  });

  describe("multi-agent + legacy key", () => {
    it("returns first configured agent and logs warning", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "alpha" }, { id: "beta" }] },
      };
      const result = resolveSessionKeyAgentId(LEGACY_ALIAS, cfg);
      expect(result).toBe("alpha");
      expect(warnMock).toHaveBeenCalledOnce();
      expect(warnMock).toHaveBeenCalledWith(
        expect.stringContaining("legacy session key"),
        expect.objectContaining({
          sessionKey: LEGACY_ALIAS,
          chosenAgent: "alpha",
        }),
      );
    });

    it("warning includes the session key and chosen agent", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "prod" }, { id: "staging" }] },
      };
      resolveSessionKeyAgentId("discord:direct:user456", cfg);
      expect(warnMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          sessionKey: "discord:direct:user456",
          chosenAgent: "prod",
        }),
      );
    });
  });

  describe("malformed agent key", () => {
    it("logs warning for malformed agent: prefix key", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "main" }] },
      };
      resolveSessionKeyAgentId("agent::broken", cfg);
      expect(warnMock).toHaveBeenCalledOnce();
      expect(warnMock).toHaveBeenCalledWith(
        expect.stringContaining("malformed session key"),
        expect.objectContaining({ sessionKey: "agent::broken" }),
      );
    });

    it("falls back to sole agent for malformed key in single-agent config", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "home" }] },
      };
      expect(resolveSessionKeyAgentId("agent:main", cfg)).toBe("home");
      expect(warnMock).toHaveBeenCalledOnce();
    });

    it("falls back to first agent for malformed key in multi-agent config", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "alpha" }, { id: "beta" }] },
      };
      expect(resolveSessionKeyAgentId("agent::broken", cfg)).toBe("alpha");
    });
  });

  describe("missing key", () => {
    it("returns sole agent for undefined key without warning", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "home" }] },
      };
      expect(resolveSessionKeyAgentId(undefined, cfg)).toBe("home");
      expect(warnMock).not.toHaveBeenCalled();
    });

    it("returns sole agent for empty string without warning", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "ops" }] },
      };
      expect(resolveSessionKeyAgentId("", cfg)).toBe("ops");
      expect(warnMock).not.toHaveBeenCalled();
    });

    it("returns first agent for missing key in multi-agent config", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [{ id: "alpha" }, { id: "beta" }] },
      };
      expect(resolveSessionKeyAgentId(null, cfg)).toBe("alpha");
      expect(warnMock).not.toHaveBeenCalled();
    });
  });

  describe("no agents configured", () => {
    it("returns legacy alias for legacy key", () => {
      const cfg: RemoteClawConfig = {};
      expect(resolveSessionKeyAgentId(LEGACY_ALIAS, cfg)).toBe(LEGACY_ALIAS);
    });

    it("returns legacy alias for missing key", () => {
      const cfg: RemoteClawConfig = {};
      expect(resolveSessionKeyAgentId(undefined, cfg)).toBe(LEGACY_ALIAS);
    });
  });
});
