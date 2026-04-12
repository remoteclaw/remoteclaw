// Cross-phase regression coverage that pins the contract a future refactor
// would need to break in order to silently reintroduce the phantom "main"
// agent through an indirect path — the class of bug no per-phase unit test
// alone covers.

import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { resolveFirstAgentWorkspace } from "../src/agents/agent-scope.js";
import type { RemoteClawConfig } from "../src/config/config.js";
import type { SessionEntry } from "../src/config/sessions.js";
import { validateConfigObject } from "../src/config/validation.js";
import type {
  DiagnosticEventPayload,
  DiagnosticRoutingDropEvent,
} from "../src/infra/diagnostic-events.js";
import { onDiagnosticEvent, resetDiagnosticEventsForTest } from "../src/infra/diagnostic-events.js";
import {
  detectLegacyStateMigrations,
  runLegacyStateMigrations,
} from "../src/infra/state-migrations.js";
import {
  resolveAgentRouteExplicit,
  resolveAgentRouteWithPolicy,
} from "../src/routing/resolve-route.js";
import {
  getRoutingDropCounts,
  installRoutingDropsAccumulator,
  resetRoutingDropsAccumulatorForTest,
} from "../src/routing/routing-drops-accumulator.js";
import {
  DEFAULT_MAIN_KEY,
  normalizeAgentId,
  normalizeAgentIdOrNull,
} from "../src/routing/session-key.js";
import { handleUnmatched } from "../src/routing/unmatched.js";
import { captureEnv } from "../src/test-utils/env.js";
import {
  loadRuntimeSourceFilesForGuardrails,
  type RuntimeSourceGuardrailFile,
} from "../src/test-utils/runtime-source-guardrail-scan.js";

const mocks = vi.hoisted(() => ({
  logInboundDrop: vi.fn<typeof import("../src/channels/logging.js").logInboundDrop>(),
}));

vi.mock("../src/channels/logging.js", async () => {
  const actual = await vi.importActual<typeof import("../src/channels/logging.js")>(
    "../src/channels/logging.js",
  );
  return {
    ...actual,
    logInboundDrop: mocks.logInboundDrop,
  };
});

// Config example fixtures — Sync with issue #2309 body in lockstep. Any
// schema drift that would break the documented examples fails this file at
// CI, preventing config/doc divergence.

const SINGLE_AGENT_CONFIG = {
  agents: {
    list: [{ id: "assistant", workspace: "~/projects", runtime: "claude" }],
  },
} as const;

const MULTI_AGENT_WITH_BINDINGS_CONFIG = {
  agents: {
    list: [
      { id: "ops", workspace: "~/ops", runtime: "claude" },
      { id: "dev", workspace: "~/dev", runtime: "codex" },
      { id: "research", workspace: "~/research", runtime: "claude" },
    ],
  },
  bindings: [
    {
      agentId: "ops",
      match: { channel: "telegram", peer: { kind: "group", id: "-100999:topic:10" } },
    },
    {
      agentId: "dev",
      match: { channel: "telegram", peer: { kind: "group", id: "-100999:topic:20" } },
    },
    {
      agentId: "research",
      match: { channel: "telegram", peer: { kind: "direct", id: "123456789" } },
    },
  ],
} as const;

const MULTI_AGENT_WITH_CATCHALL_CONFIG = {
  agents: {
    list: [
      { id: "ops", workspace: "~/ops", runtime: "claude" },
      { id: "dev", workspace: "~/dev", runtime: "codex" },
      { id: "triage", workspace: "~/triage", runtime: "claude" },
    ],
  },
  bindings: [
    {
      agentId: "ops",
      match: { channel: "telegram", peer: { kind: "group", id: "-100999:topic:10" } },
    },
    {
      agentId: "dev",
      match: { channel: "telegram", peer: { kind: "group", id: "-100999:topic:20" } },
    },
  ],
  routing: {
    unmatched: { agent: "triage" },
  },
} as const;

const MULTI_AGENT_WITH_EXPLICIT_REJECT_CONFIG = {
  agents: {
    list: [
      { id: "ops", workspace: "~/ops", runtime: "claude" },
      { id: "dev", workspace: "~/dev", runtime: "codex" },
    ],
  },
  bindings: [
    {
      agentId: "ops",
      match: { channel: "telegram", peer: { kind: "group", id: "-100999:topic:10" } },
    },
  ],
  routing: { unmatched: "reject" },
} as const;

beforeEach(() => {
  mocks.logInboundDrop.mockClear();
  resetDiagnosticEventsForTest();
  resetRoutingDropsAccumulatorForTest();
});

afterEach(() => {
  resetRoutingDropsAccumulatorForTest();
  resetDiagnosticEventsForTest();
});

function parseOrThrow(raw: unknown): RemoteClawConfig {
  const result = validateConfigObject(raw);
  if (!result.ok) {
    throw new Error(
      `config parse failed: ${result.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
    );
  }
  return result.config;
}

function captureDroppedEvents(): {
  events: DiagnosticRoutingDropEvent[];
  dispose: () => void;
} {
  const events: DiagnosticRoutingDropEvent[] = [];
  const dispose = onDiagnosticEvent((evt: DiagnosticEventPayload) => {
    if (evt.type === "routing.drop") {
      events.push(evt);
    }
  });
  return { events, dispose };
}

describe("config example parsing (#2309 fixtures)", () => {
  test("single-agent config parses and boots startup path", () => {
    const cfg = parseOrThrow(SINGLE_AGENT_CONFIG);
    expect(cfg.agents?.list).toHaveLength(1);
    expect(cfg.agents?.list?.[0]?.id).toBe("assistant");
    // Startup path: resolveFirstAgentWorkspace must return the single agent's
    // workspace. A null return is how #2308 detects "No agents configured".
    expect(resolveFirstAgentWorkspace(cfg)).not.toBeNull();
  });

  test("multi-agent with bindings config parses and boots startup path", () => {
    const cfg = parseOrThrow(MULTI_AGENT_WITH_BINDINGS_CONFIG);
    expect(cfg.agents?.list).toHaveLength(3);
    expect(cfg.bindings).toHaveLength(3);
    expect(resolveFirstAgentWorkspace(cfg)).not.toBeNull();
  });

  test("multi-agent with explicit catch-all config parses and boots startup path", () => {
    const cfg = parseOrThrow(MULTI_AGENT_WITH_CATCHALL_CONFIG);
    expect(cfg.agents?.list).toHaveLength(3);
    expect(cfg.routing?.unmatched).toEqual({ agent: "triage" });
    expect(resolveFirstAgentWorkspace(cfg)).not.toBeNull();
  });

  test("multi-agent with explicit 'reject' catch-all config parses and boots startup path", () => {
    const cfg = parseOrThrow(MULTI_AGENT_WITH_EXPLICIT_REJECT_CONFIG);
    expect(cfg.agents?.list).toHaveLength(2);
    expect(cfg.routing?.unmatched).toBe("reject");
    expect(resolveFirstAgentWorkspace(cfg)).not.toBeNull();
  });

  test("'reject' is semantically identical to omitted routing.unmatched", () => {
    // Behavior parity check: the #2309 reference table asserts both produce
    // the same silent-drop + telemetry outcome.
    const withExplicit = parseOrThrow(MULTI_AGENT_WITH_EXPLICIT_REJECT_CONFIG);
    const withOmitted = parseOrThrow({
      agents: MULTI_AGENT_WITH_EXPLICIT_REJECT_CONFIG.agents,
      bindings: MULTI_AGENT_WITH_EXPLICIT_REJECT_CONFIG.bindings,
    });
    const unmatchedScope = {
      channel: "slack",
      accountId: "default",
      peer: { kind: "direct" as const, id: "stranger" },
      guildId: null,
      teamId: null,
    };
    expect(handleUnmatched(unmatchedScope, withExplicit)).toEqual({ action: "drop" });
    expect(handleUnmatched(unmatchedScope, withOmitted)).toEqual({ action: "drop" });
  });
});

describe("full startup scenarios — happy path", () => {
  test("single agent with any name routes all messages via sole-agent promotion", () => {
    const cfg = parseOrThrow({
      agents: { list: [{ id: "assistant", workspace: "/tmp/work" }] },
    });
    // Sole-agent promotion bypasses binding resolution; the agent handles every
    // inbound regardless of channel, peer, or whether a binding exists.
    for (const channel of ["telegram", "slack", "discord", "whatsapp"]) {
      const outcome = resolveAgentRouteExplicit({
        cfg,
        channel,
        accountId: null,
        peer: { kind: "direct", id: "+1555" },
      });
      expect(outcome.matched).toBe(true);
      if (outcome.matched) {
        expect(outcome.agentId).toBe("assistant");
        expect(outcome.matchedBy).toBe("fallback.soleAgent");
      }
    }
  });

  test("multi-agent with bindings routes each message to the binding's agent", () => {
    const cfg = parseOrThrow(MULTI_AGENT_WITH_BINDINGS_CONFIG);
    const cases: Array<{ peerId: string; expectedAgent: string }> = [
      { peerId: "-100999:topic:10", expectedAgent: "ops" },
      { peerId: "-100999:topic:20", expectedAgent: "dev" },
    ];
    for (const { peerId, expectedAgent } of cases) {
      const outcome = resolveAgentRouteExplicit({
        cfg,
        channel: "telegram",
        accountId: null,
        peer: { kind: "group", id: peerId },
      });
      expect(outcome.matched).toBe(true);
      if (outcome.matched) {
        expect(outcome.agentId).toBe(expectedAgent);
        expect(outcome.matchedBy).toBe("binding.peer");
      }
    }
    // Direct peer binding for the research agent.
    const research = resolveAgentRouteExplicit({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "123456789" },
    });
    expect(research.matched).toBe(true);
    if (research.matched) {
      expect(research.agentId).toBe("research");
      expect(research.matchedBy).toBe("binding.peer");
    }
  });

  test("multi-agent with catch-all routes unmatched messages to catch-all agent (no phantom)", () => {
    const cfg = parseOrThrow(MULTI_AGENT_WITH_CATCHALL_CONFIG);
    // Policy-aware variant applies the catch-all automatically.
    const route = resolveAgentRouteWithPolicy({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "no-such-peer" },
    });
    expect(route).not.toBeNull();
    expect(route?.agentId).toBe("triage");
    expect(route?.matchedBy).toBe("unmatched.catchAll");
    // Explicit variant (raw discriminated union) returns matched: false on
    // unmatched — the caller then invokes handleUnmatched which consults
    // routing.unmatched and returns an explicit route action. This split is
    // the whole point of #2309's two-layer design: the type layer says "no
    // binding matched" and the policy layer says "catch-all says route to X".
    const explicit = resolveAgentRouteExplicit({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "no-such-peer" },
    });
    expect(explicit.matched).toBe(false);
    if (explicit.matched) {
      return;
    }
    const action = handleUnmatched(explicit.scope, cfg);
    expect(action).toEqual({ action: "route", agentId: "triage" });
  });

  test("multi-agent with omitted routing.unmatched silently drops with all four telemetry surfaces and no reply", () => {
    const cfg = parseOrThrow({
      agents: MULTI_AGENT_WITH_BINDINGS_CONFIG.agents,
      bindings: MULTI_AGENT_WITH_BINDINGS_CONFIG.bindings,
    });
    installRoutingDropsAccumulator();
    const capture = captureDroppedEvents();

    const outcome = resolveAgentRouteExplicit({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "unmatched-stranger" },
    });
    expect(outcome.matched).toBe(false);
    if (outcome.matched) {
      return; // unreachable, satisfies TS narrowing
    }
    expect(outcome.reason).toBe("unmatched");

    const action = handleUnmatched(outcome.scope, cfg);
    // (a) No route taken — no reply possible at the routing layer.
    expect(action).toEqual({ action: "drop" });

    // (b) logInboundDrop called once with reason="unmatched-binding" and
    //     correct channel. Surface 1 of the 4-surface telemetry contract.
    expect(mocks.logInboundDrop).toHaveBeenCalledTimes(1);
    const logCall = mocks.logInboundDrop.mock.calls[0]?.[0] as {
      reason: string;
      channel: string;
      target?: string;
    };
    expect(logCall.reason).toBe("unmatched-binding");
    expect(logCall.channel).toBe("telegram");

    // (c) `routing.drop` diagnostic event emitted with scope details. This is
    //     the single emission point that the Control UI broadcast subscribes
    //     to (Surface 3) as well as the OTel counter + status accumulator.
    expect(capture.events).toHaveLength(1);
    const evt = capture.events[0];
    expect(evt).toBeDefined();
    if (!evt) {
      return;
    }
    expect(evt.type).toBe("routing.drop");
    expect(evt.channel).toBe("telegram");
    expect(evt.reason).toBe("unmatched");
    expect(evt.scope.peer).toEqual({ kind: "direct", id: "unmatched-stranger" });
    expect(evt.configuredAgents).toEqual(["ops", "dev", "research"]);

    // (d) Routing-drops accumulator incremented — Surface 2 (OTel counter
    //     metric `remoteclaw.routing.drops`) and Surface 4 (`/remoteclaw status`
    //     command accrual) both read from this single accumulator.
    const counts = getRoutingDropCounts();
    expect(counts.total).toBe(1);
    expect(counts.byChannel.telegram).toBe(1);
    expect(counts.byReason.unmatched).toBe(1);

    capture.dispose();
  });
});

describe("full startup scenarios — negative path", () => {
  test("empty agents.list fails at parse time with explicit message", () => {
    const result = validateConfigObject({ agents: { list: [] } });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(
      result.issues.some((i) => i.message.includes("agents.list must contain at least one entry")),
    ).toBe(true);
  });

  test("missing workspace fails at parse time naming the offending agent slot", () => {
    const result = validateConfigObject({
      agents: { list: [{ id: "valid", workspace: "~/w" }, { id: "broken" }] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    const workspaceIssue = result.issues.find((i) => i.path.includes("workspace"));
    expect(workspaceIssue).toBeDefined();
    // Path must identify which entry (list.1 = second agent "broken").
    expect(workspaceIssue?.path).toContain("agents.list");
    expect(workspaceIssue?.path).toContain("1");
  });

  test("whitespace-only workspace fails at parse time with the custom message", () => {
    const result = validateConfigObject({
      agents: { list: [{ id: "ops", workspace: "   " }] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(
      result.issues.some((i) =>
        i.message.includes("agents.list[].workspace must be a non-empty string"),
      ),
    ).toBe(true);
  });

  test("unknown routing.unmatched.agent fails at parse time with message identifying the unknown id", () => {
    const result = validateConfigObject({
      agents: {
        list: [
          { id: "ops", workspace: "~/o" },
          { id: "dev", workspace: "~/d" },
        ],
      },
      routing: { unmatched: { agent: "ghost" } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    const issue = result.issues.find((i) => i.path === "routing.unmatched.agent");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("Unknown agent id");
    expect(issue?.message).toContain("ghost");
    expect(issue?.message).toContain("agents.list");
  });

  test("runtime startup guard rejects config with undefined agents via resolveFirstAgentWorkspace", () => {
    // `agents` is optional in the schema, so `{}` parses. The runtime guard
    // installed by #2308 at server.impl.ts then catches it when
    // resolveFirstAgentWorkspace returns null.
    const cfg: RemoteClawConfig = {};
    expect(resolveFirstAgentWorkspace(cfg)).toBeNull();
  });
});

describe("routing end-to-end — additional regression guards", () => {
  test("matched binding routing (baseline — must not regress)", () => {
    const cfg = parseOrThrow({
      agents: {
        list: [
          { id: "alpha", workspace: "~/a" },
          { id: "beta", workspace: "~/b" },
        ],
      },
      bindings: [
        {
          agentId: "alpha",
          match: { channel: "slack", peer: { kind: "direct", id: "U1" } },
        },
      ],
    });
    const outcome = resolveAgentRouteExplicit({
      cfg,
      channel: "slack",
      accountId: null,
      peer: { kind: "direct", id: "U1" },
    });
    expect(outcome.matched).toBe(true);
    if (outcome.matched) {
      expect(outcome.agentId).toBe("alpha");
      expect(outcome.matchedBy).toBe("binding.peer");
    }
    // Drop path must not have fired.
    expect(mocks.logInboundDrop).not.toHaveBeenCalled();
  });

  test("catch-all does NOT emit routing.drop telemetry (route taken, not dropped)", () => {
    const cfg = parseOrThrow(MULTI_AGENT_WITH_CATCHALL_CONFIG);
    installRoutingDropsAccumulator();
    const capture = captureDroppedEvents();

    const outcome = resolveAgentRouteExplicit({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "stranger" },
    });
    expect(outcome.matched).toBe(false);
    if (outcome.matched) {
      return;
    }
    const action = handleUnmatched(outcome.scope, cfg);
    expect(action).toEqual({ action: "route", agentId: "triage" });

    // Route action taken — no drop telemetry should have fired.
    expect(capture.events).toHaveLength(0);
    expect(getRoutingDropCounts().total).toBe(0);
    expect(mocks.logInboundDrop).not.toHaveBeenCalled();

    capture.dispose();
  });

  test("sole-agent routing bypasses routing.unmatched policy entirely", () => {
    const cfg = parseOrThrow({
      agents: { list: [{ id: "only", workspace: "~/w" }] },
      routing: { unmatched: "reject" },
    });
    const route = resolveAgentRouteWithPolicy({
      cfg,
      channel: "whatsapp",
      accountId: null,
      peer: { kind: "direct", id: "+44-stranger" },
    });
    expect(route).not.toBeNull();
    expect(route?.agentId).toBe("only");
    expect(route?.matchedBy).toBe("fallback.soleAgent");
  });

  test("accumulator aggregates drops across channels", () => {
    const cfg = parseOrThrow({
      agents: {
        list: [
          { id: "ops", workspace: "~/o" },
          { id: "dev", workspace: "~/d" },
        ],
      },
      bindings: [],
    });
    installRoutingDropsAccumulator();

    for (const channel of ["telegram", "telegram", "slack"]) {
      const outcome = resolveAgentRouteExplicit({
        cfg,
        channel,
        accountId: null,
        peer: { kind: "direct", id: "nobody" },
      });
      if (!outcome.matched) {
        handleUnmatched(outcome.scope, cfg);
      }
    }

    const counts = getRoutingDropCounts();
    expect(counts.total).toBe(3);
    expect(counts.byChannel).toEqual({ telegram: 2, slack: 1 });
    expect(counts.byReason).toEqual({ unmatched: 3 });
  });
});

// Session-continuity tests seed a state directory on disk and assert the
// rewritten store matches the upgrade contract introduced by #2312. They
// deliberately overlap with src/infra/state-migrations.orphaned-main-keys.test.ts
// for defense in depth against a cross-phase regression landing via a subtle
// change in either the detection or execution half of the pipeline.

describe("session continuity across upgrade", () => {
  let fixtureRoot = "";
  let caseCounter = 0;
  let envGuard: { restore: () => void } | null = null;

  type StoreFixture = Record<string, SessionEntry & Record<string, unknown>>;

  const writeSessionStore = async (storePath: string, store: StoreFixture): Promise<void> => {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  };

  const readStore = async (storePath: string): Promise<StoreFixture> => {
    const raw = await fs.readFile(storePath, "utf8");
    return JSON.parse(raw) as StoreFixture;
  };

  const makeEntry = (updatedAt: number, tag = ""): SessionEntry & Record<string, unknown> => ({
    sessionId: `session-${updatedAt}${tag}`,
    updatedAt,
  });

  const setupCase = async (params: {
    prefix: string;
    targetAgentId: string;
    seed: StoreFixture;
  }): Promise<{ stateDir: string; targetStorePath: string }> => {
    const stateDir = path.join(fixtureRoot, `${params.prefix}-${caseCounter++}`);
    await fs.mkdir(stateDir, { recursive: true });
    envGuard = captureEnv(["REMOTECLAW_STATE_DIR", "REMOTECLAW_TEST_FAST"]);
    process.env.REMOTECLAW_STATE_DIR = stateDir;
    process.env.REMOTECLAW_TEST_FAST = "1";
    const targetStorePath = path.join(
      stateDir,
      "agents",
      params.targetAgentId,
      "sessions",
      "sessions.json",
    );
    await writeSessionStore(targetStorePath, params.seed);
    return { stateDir, targetStorePath };
  };

  const buildCfg = (ids: string[]): RemoteClawConfig => ({
    agents: { list: ids.map((id) => ({ id, workspace: "~/w" })) },
  });

  beforeAll(async () => {
    const tmpRoot = path.resolve(
      import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
      "..",
      ".tmp",
    );
    await fs.mkdir(tmpRoot, { recursive: true });
    fixtureRoot = await fs.mkdtemp(path.join(tmpRoot, "remoteclaw-2316-"));
  });

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
    fixtureRoot = "";
    caseCounter = 0;
  });

  afterEach(() => {
    envGuard?.restore();
    envGuard = null;
  });

  test("Case A: sole non-'main' agent rewrites agent:main:* keys to agent:{soleAgentId}:*", async () => {
    const ctx = await setupCase({
      prefix: "case-a",
      targetAgentId: "assistant",
      seed: {
        "agent:main:telegram:direct:42": makeEntry(1_000, "-a"),
        "agent:main:main": makeEntry(2_000, "-b"),
      },
    });

    const cfg = buildCfg(["assistant"]);
    const detected = await detectLegacyStateMigrations({ cfg });
    expect(detected.orphanedMainKeys.scenario).toBe("A");
    expect(detected.orphanedMainKeys.keys).toHaveLength(2);

    const result = await runLegacyStateMigrations({ detected });
    expect(result.warnings).toEqual([]);
    expect(result.changes.some((line) => line.includes("Rewrote 2"))).toBe(true);

    const rewritten = await readStore(ctx.targetStorePath);
    expect(Object.keys(rewritten).toSorted()).toEqual([
      "agent:assistant:main",
      "agent:assistant:telegram:direct:42",
    ]);
    // Sessions remain reachable — their sessionId fields are preserved.
    expect(rewritten["agent:assistant:main"]?.sessionId).toBe("session-2000-b");
    expect(rewritten["agent:assistant:telegram:direct:42"]?.sessionId).toBe("session-1000-a");
  });

  test('Case B: sole "main" agent performs no rewrite and leaves keys untouched', async () => {
    const ctx = await setupCase({
      prefix: "case-b",
      targetAgentId: "main",
      seed: {
        "agent:main:telegram:direct:42": makeEntry(1_000),
        "agent:main:main": makeEntry(2_000),
      },
    });

    const cfg = buildCfg(["main"]);
    const detected = await detectLegacyStateMigrations({ cfg });
    expect(detected.orphanedMainKeys.scenario).toBe("B");

    const result = await runLegacyStateMigrations({ detected });
    expect(result.warnings).toEqual([]);
    expect(
      result.changes.some((line) => line.includes("No agent:main:* session key migration needed")),
    ).toBe(true);

    const after = await readStore(ctx.targetStorePath);
    expect(Object.keys(after).toSorted()).toEqual([
      "agent:main:main",
      "agent:main:telegram:direct:42",
    ]);
  });

  test("Case C: multi-agent emits warning and preserves orphaned keys non-destructively", async () => {
    const ctx = await setupCase({
      prefix: "case-c",
      targetAgentId: "alpha",
      seed: {
        "agent:main:telegram:direct:42": makeEntry(1_000),
        "agent:main:whatsapp:group:xyz@g.us": makeEntry(2_000),
      },
    });

    const cfg = buildCfg(["alpha", "beta"]);
    const detected = await detectLegacyStateMigrations({ cfg });
    expect(detected.orphanedMainKeys.scenario).toBe("C");
    expect(detected.orphanedMainKeys.configuredAgentIds).toEqual(["alpha", "beta"]);

    const result = await runLegacyStateMigrations({ detected });
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0] ?? "";
    expect(warning).toContain("Found 2 orphaned agent:main:* session key(s)");
    expect(warning).toContain("Configured agents: alpha, beta");

    // Non-destructive: original keys still present.
    const after = await readStore(ctx.targetStorePath);
    expect(after["agent:main:telegram:direct:42"]).toBeDefined();
    expect(after["agent:main:whatsapp:group:xyz@g.us"]).toBeDefined();
  });

  test("idempotency: re-running migration reports zero orphan changes and zero warnings", async () => {
    await setupCase({
      prefix: "idempotent",
      targetAgentId: "assistant",
      seed: {
        "agent:main:telegram:direct:42": makeEntry(1_000),
      },
    });

    const cfg = buildCfg(["assistant"]);
    const first = await detectLegacyStateMigrations({ cfg });
    await runLegacyStateMigrations({ detected: first });

    // Second run must find no orphans and make no changes.
    const second = await detectLegacyStateMigrations({ cfg });
    expect(second.orphanedMainKeys.scenario).toBe("none");
    expect(second.orphanedMainKeys.keys).toEqual([]);

    const result = await runLegacyStateMigrations({ detected: second });
    expect(result.warnings).toEqual([]);
    expect(result.changes.filter((line) => line.includes("agent:main:")).length).toBe(0);
  });
});

// Grep guards use the shared runtime-source scanner which is git-aware,
// cached across calls, and already filters test/helper/type-declaration files.
// The scanner reads every file once per test run; subsequent guard tests
// iterate the cached array with their own regex.

describe("phantom-agent reintroduction guards", () => {
  let runtimeSources: RuntimeSourceGuardrailFile[] = [];

  beforeAll(async () => {
    runtimeSources = (await loadRuntimeSourceFilesForGuardrails(process.cwd())).filter((file) =>
      file.relativePath.startsWith(`src${path.sep}`),
    );
    expect(runtimeSources.length).toBeGreaterThan(100);
  });

  test("no file in src/ exports a constant named DEFAULT_AGENT_ID", () => {
    const exportRe = /\bexport\s+(?:const|let|var)\s+DEFAULT_AGENT_ID\b/;
    const offenders = runtimeSources
      .filter((file) => exportRe.test(file.source))
      .map((file) => file.relativePath);
    expect(offenders).toEqual([]);
  });

  test("no file in src/ imports DEFAULT_AGENT_ID from session-key.ts (symbol was deleted)", () => {
    // Whole-word DEFAULT_AGENT_ID so substrings like LEGACY_OPENCLAW_DEFAULT_AGENT_ID
    // in src/commands/import.ts don't trigger.
    const importRe =
      /^\s*import\b[^;]*\bDEFAULT_AGENT_ID\b[^;]*from\s+["'][^"']*session-key[^"']*["']/m;
    const offenders = runtimeSources
      .filter((file) => importRe.test(file.source))
      .map((file) => file.relativePath);
    expect(offenders).toEqual([]);
  });

  test("no file in src/ calls resolveDefaultAgentId() (function was deleted in #2310)", () => {
    const callRe = /\bresolveDefaultAgentId\s*\(/;
    const offenders: string[] = [];
    for (const file of runtimeSources) {
      const stripped = file.source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (callRe.test(stripped)) {
        offenders.push(file.relativePath);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("normalizeAgentId has the strict (value: string) => string signature", () => {
    // Assigning to a narrowly-typed variable fails type-check if normalizeAgentId
    // is ever replaced with the nullable variant.
    const strict: (value: string) => string = normalizeAgentId;
    expect(() => strict("")).toThrow(/cannot be empty/i);
    expect(strict("ops")).toBe("ops");
    expect(normalizeAgentIdOrNull("")).toBeNull();
    expect(normalizeAgentIdOrNull(undefined)).toBeNull();
    expect(normalizeAgentIdOrNull("Ops")).toBe("ops");
  });

  test("DEFAULT_MAIN_KEY is preserved as the session-key segment constant", () => {
    // Preserved DELIBERATELY alongside the deletion of DEFAULT_AGENT_ID: it is
    // the session-key segment for canonical direct-chat collapse
    // (`agent:{id}:{mainKey}`), unrelated to the phantom agent concept. A
    // refactor that deletes it would break every stored session key.
    expect(DEFAULT_MAIN_KEY).toBe("main");
  });

  test("behavioral guard: resolveAgentRouteExplicit never injects a phantom agent on unmatched", () => {
    // Catches reintroduction through any mechanism — a new call site that
    // hardcodes "main" as an agent id would still produce a matched route here.
    const cfg = parseOrThrow({
      agents: {
        list: [
          { id: "x", workspace: "~/x" },
          { id: "y", workspace: "~/y" },
        ],
      },
      bindings: [],
    });
    const outcome = resolveAgentRouteExplicit({
      cfg,
      channel: "telegram",
      accountId: null,
      peer: { kind: "direct", id: "phantom-target" },
    });
    expect(outcome.matched).toBe(false);
    if (!outcome.matched) {
      expect(outcome.reason).toBe("unmatched");
      // The discriminated union precludes accidental phantom injection.
      expect((outcome as { agentId?: string }).agentId).toBeUndefined();
    }
  });
});
