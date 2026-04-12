import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import * as diagnosticEvents from "../infra/diagnostic-events.js";
import { resolveAgentRouteExplicit, resolveAgentRouteWithPolicy } from "./resolve-route.js";
import { handleUnmatched } from "./unmatched.js";

const SCOPE_MULTI = {
  channel: "telegram",
  accountId: "default",
  peer: { kind: "direct" as const, id: "+1555" },
  guildId: null,
  teamId: null,
};

describe("handleUnmatched", () => {
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    diagnosticEvents.resetDiagnosticEventsForTest();
    emitSpy = vi.spyOn(diagnosticEvents, "emitDiagnosticEvent");
  });

  afterEach(() => {
    emitSpy.mockRestore();
    diagnosticEvents.resetDiagnosticEventsForTest();
  });

  test("drops when routing.unmatched is omitted", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "ops" }, { id: "dev" }] },
    };
    const result = handleUnmatched(SCOPE_MULTI, cfg);
    expect(result).toEqual({ action: "drop" });
  });

  test("drops when routing.unmatched is literal 'reject'", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "ops" }, { id: "dev" }] },
      routing: { unmatched: "reject" },
    };
    const result = handleUnmatched(SCOPE_MULTI, cfg);
    expect(result).toEqual({ action: "drop" });
  });

  test("routes to catch-all agent when routing.unmatched.agent is set", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "ops" }, { id: "dev" }, { id: "triage" }] },
      routing: { unmatched: { agent: "triage" } },
    };
    const result = handleUnmatched(SCOPE_MULTI, cfg);
    expect(result).toEqual({ action: "route", agentId: "triage" });
  });

  test("emits routing.drop diagnostic event on silent drop", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "ops" }, { id: "dev" }] },
    };
    handleUnmatched(SCOPE_MULTI, cfg);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    const payload = emitSpy.mock.calls[0]?.[0] as {
      type: string;
      channel: string;
      reason: string;
      configuredAgents: string[];
      target?: string;
    };
    expect(payload.type).toBe("routing.drop");
    expect(payload.channel).toBe("telegram");
    expect(payload.reason).toBe("unmatched");
    expect(payload.configuredAgents).toEqual(["ops", "dev"]);
    expect(payload.target).toBe("direct:+1555");
  });

  test("does NOT emit diagnostic event on catch-all route", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "ops" }, { id: "triage" }] },
      routing: { unmatched: { agent: "triage" } },
    };
    handleUnmatched(SCOPE_MULTI, cfg);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  test("resolves target from accountId when peer is absent", () => {
    const scope = {
      channel: "discord",
      accountId: "account-xyz",
      peer: null,
      guildId: null,
      teamId: null,
    };
    const cfg: RemoteClawConfig = { agents: { list: [{ id: "ops" }, { id: "dev" }] } };
    handleUnmatched(scope, cfg);
    const payload = emitSpy.mock.calls[0]?.[0] as { target?: string };
    expect(payload.target).toBe("account-xyz");
  });
});

describe("resolveAgentRouteWithPolicy", () => {
  beforeEach(() => {
    diagnosticEvents.resetDiagnosticEventsForTest();
  });

  test("returns matched route when binding matches", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "ops" }, { id: "dev" }] },
      bindings: [
        {
          agentId: "ops",
          match: { channel: "telegram", peer: { kind: "direct", id: "+1555" } },
        },
      ],
    };
    const route = resolveAgentRouteWithPolicy({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "+1555" },
    });
    expect(route).not.toBeNull();
    expect(route?.agentId).toBe("ops");
    expect(route?.matchedBy).toBe("binding.peer");
  });

  test("returns null when no binding matches and routing.unmatched is omitted", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "ops" }, { id: "dev" }] },
    };
    const route = resolveAgentRouteWithPolicy({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "+1555" },
    });
    expect(route).toBeNull();
  });

  test("returns null when routing.unmatched is 'reject'", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "ops" }, { id: "dev" }] },
      routing: { unmatched: "reject" },
    };
    const route = resolveAgentRouteWithPolicy({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "+1555" },
    });
    expect(route).toBeNull();
  });

  test("routes to catch-all agent when routing.unmatched.agent is set", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "ops" }, { id: "dev" }, { id: "triage" }] },
      routing: { unmatched: { agent: "triage" } },
    };
    const route = resolveAgentRouteWithPolicy({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "+1555" },
    });
    expect(route).not.toBeNull();
    expect(route?.agentId).toBe("triage");
    expect(route?.matchedBy).toBe("unmatched.catchAll");
  });

  test("sole-agent promotion bypasses routing.unmatched entirely", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "only" }] },
      routing: { unmatched: "reject" },
    };
    const route = resolveAgentRouteWithPolicy({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "+1555" },
    });
    expect(route).not.toBeNull();
    expect(route?.agentId).toBe("only");
    expect(route?.matchedBy).toBe("fallback.soleAgent");
  });
});

describe("resolveAgentRouteExplicit", () => {
  test("returns matched: true variant when binding matches", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "ops" }] },
      bindings: [
        {
          agentId: "ops",
          match: { channel: "telegram", peer: { kind: "direct", id: "+1555" } },
        },
      ],
    };
    const outcome = resolveAgentRouteExplicit({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "+1555" },
    });
    expect(outcome.matched).toBe(true);
    if (outcome.matched) {
      expect(outcome.agentId).toBe("ops");
    }
  });

  test("returns matched: false variant when no binding matches in multi-agent config", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "ops" }, { id: "dev" }] },
    };
    const outcome = resolveAgentRouteExplicit({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "+1555" },
    });
    expect(outcome.matched).toBe(false);
    if (!outcome.matched) {
      expect(outcome.reason).toBe("unmatched");
      expect(outcome.scope.channel).toBe("telegram");
      expect(outcome.scope.peer).toEqual({ kind: "direct", id: "+1555" });
    }
  });
});
