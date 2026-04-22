import { vi } from "vitest";

export function registerGetReplyCommonMocks(): void {
  vi.mock("../../agents/agent-scope.js", () => ({
    resolveAgentDir: vi.fn(() => "/tmp/agent"),
    resolveAgentWorkspaceDir: vi.fn(() => "/tmp/workspace"),
    resolveSessionAgentId: vi.fn(() => "main"),
    resolveAgentSkillsFilter: vi.fn(() => undefined),
  }));
  vi.mock("../../agents/timeout.js", () => ({
    resolveAgentTimeoutMs: vi.fn(() => 60000),
  }));
  vi.mock("../../agents/workspace.js", () => ({
    DEFAULT_AGENT_WORKSPACE_DIR: "/tmp/workspace",
    ensureAgentWorkspace: vi.fn(async () => ({ dir: "/tmp/workspace" })),
  }));
  vi.mock("../../config/config.js", () => ({
    loadConfig: vi.fn(() => ({})),
  }));
  vi.mock("../../runtime.js", () => ({
    defaultRuntime: { log: vi.fn() },
  }));
  vi.mock("../command-auth.js", () => ({
    resolveCommandAuthorization: vi.fn(() => ({
      isAuthorizedSender: true,
      ownerList: [],
      senderIsOwner: false,
    })),
  }));
  // Preserve real directive parsing (parseInlineDirectives, isDirectiveOnly, etc.)
  // so tests driving the real resolveReplyDirectives chain can compile directives.
  // Only `resolveDefaultModel` is stubbed to avoid config/model catalog I/O.
  vi.mock("./directive-handling.js", async () => {
    const actual =
      await vi.importActual<typeof import("./directive-handling.js")>("./directive-handling.js");
    return {
      ...actual,
      resolveDefaultModel: vi.fn(() => ({
        defaultProvider: "openai",
        defaultModel: "gpt-4o-mini",
        aliasIndex: new Map(),
      })),
    };
  });
  // Note: We deliberately do NOT mock `./get-reply-run.js` → `runPreparedReply`.
  // A global shield at this boundary was one of the five blindspots that hid #2334
  // from CI (see #2468). Tests that need to short-circuit before `runPreparedReply`
  // should mock `./get-reply-inline-actions.js` or `./get-reply-directives.js`
  // locally to return `{ kind: "reply", ... }`. Tests that drive the full chain
  // should mock only the CLI boundary (`./agent-runner.js` → `runReplyAgent`).
  vi.mock("./inbound-context.js", () => ({
    finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
  }));
  vi.mock("./typing.js", () => ({
    createTypingController: vi.fn(() => ({
      onReplyStart: async () => undefined,
      startTypingLoop: async () => undefined,
      startTypingOnText: async () => undefined,
      refreshTypingTtl: () => undefined,
      isActive: () => false,
      markRunComplete: () => undefined,
      markDispatchIdle: () => undefined,
      cleanup: () => undefined,
    })),
  }));
}
