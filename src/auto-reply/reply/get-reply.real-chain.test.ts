import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MsgContext } from "../templating.js";
import { registerGetReplyCommonMocks } from "./get-reply.test-mocks.js";

// Regression test for #2468 (Area 8 of #2336).
//
// Historical context: the crash in #2334 (TypeError: modelState.resolveDefaultThinkingLevel
// is not a function) was hidden from CI by five independent shields. One of them
// was a global `vi.mock("./get-reply-run.js", () => ({ runPreparedReply: vi.fn(...) }))`
// in `get-reply.test-mocks.ts`, which prevented any integration test from exercising
// the `resolveReplyDirectives` → `runPreparedReply` boundary in the real chain.
//
// That shield is now removed. This test drives `getReplyFromConfig` through the
// real `resolveReplyDirectives` → `handleInlineActions` → `runPreparedReply` path
// for a plain first-turn webchat message, so any future regression at that boundary
// (shape drift, missing method on a threaded object, etc.) surfaces at test time
// instead of at runtime.
//
// The only mocked boundaries are:
//   - Common reply deps (agent-scope, config, typing, etc.) via `registerGetReplyCommonMocks`
//   - `./session.js` → `initSessionState` (avoids filesystem I/O)
//   - `./agent-runner.js` → `runReplyAgent` (avoids actual CLI subprocess)
//   - `../media-note.js`, `./route-reply.js` (outbound delivery)
//   - `../../plugins/hook-runner-global.js` (hook runtime)
//   - `../../channels/dock.js` (channel registry)
//   - `../../config/sessions.js` (session store persistence)
//   - `../../agents/session-run-registry.js` (queue-mode registry)
//
// No fabricated shapes for `resolveReplyDirectives` or `runPreparedReply` output.

registerGetReplyCommonMocks();

vi.mock("../../agents/session-run-registry.js", () => ({
  isSessionRunActive: vi.fn(() => false),
  killSessionRun: vi.fn(),
}));

vi.mock("../../channels/dock.js", async () => {
  const actual = await vi.importActual<typeof import("../../channels/dock.js")>("../../channels/dock.js");
  return {
    ...actual,
    getChannelDock: vi.fn(() => undefined),
  };
});

vi.mock("../../config/sessions.js", async () => {
  const actual = await vi.importActual<typeof import("../../config/sessions.js")>("../../config/sessions.js");
  return {
    ...actual,
    loadSessionStore: vi.fn(() => ({})),
    resolveStorePath: vi.fn(() => "/tmp/session-store.json"),
    resolveGroupSessionKey: vi.fn(() => undefined),
    resolveSessionFilePath: vi.fn(() => "/tmp/session.jsonl"),
    resolveSessionFilePathOptions: vi.fn(() => ({})),
    resolveSessionKey: vi.fn(({ ctx }: { ctx: MsgContext }) => ctx.SessionKey ?? "session-key"),
    resolveSessionTranscriptPath: vi.fn(() => "/tmp/transcript.jsonl"),
    updateSessionStore: vi.fn(),
  };
});

vi.mock("../../link-understanding/apply.js", () => ({
  applyLinkUnderstanding: vi.fn(async () => undefined),
}));

vi.mock("../../media-understanding/apply.js", () => ({
  applyMediaUnderstanding: vi.fn(async () => undefined),
}));

vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: vi.fn(() => ({
    runHook: vi.fn(async () => undefined),
    runLifecycleHook: vi.fn(async () => undefined),
    triggerInternalHook: vi.fn(async () => undefined),
  })),
}));

vi.mock("../media-note.js", () => ({
  buildInboundMediaNote: vi.fn(() => undefined),
}));

vi.mock("./agent-runner.js", () => ({
  runReplyAgent: vi.fn(async () => ({ text: "ok" })),
}));

vi.mock("./route-reply.js", () => ({
  routeReply: vi.fn(async () => undefined),
}));

vi.mock("./session.js", () => ({
  initSessionState: vi.fn(),
}));

const { initSessionState } = await import("./session.js");
const { runReplyAgent } = await import("./agent-runner.js");
const { getReplyFromConfig } = await import("./get-reply.js");

function buildFirstTurnWebchatContext(): MsgContext {
  return {
    Provider: "webchat",
    Surface: "webchat",
    ChatType: "direct",
    Body: "hello",
    RawBody: "hello",
    CommandBody: "hello",
    SessionKey: "agent:main:webchat:direct:user-1",
    From: "webchat:user-1",
    To: "webchat:agent",
    OriginatingChannel: "webchat",
    OriginatingTo: "webchat:user-1",
  };
}

describe("getReplyFromConfig real chain — regression for #2468 / #2334", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const sessionEntry = { sessionId: "session-1", updatedAt: 1_700_000_000_000 };
    vi.mocked(initSessionState).mockResolvedValue({
      sessionCtx: {
        ...buildFirstTurnWebchatContext(),
        BodyForAgent: "hello",
        BodyStripped: "hello",
      },
      sessionEntry,
      previousSessionEntry: sessionEntry,
      sessionStore: {},
      sessionKey: "agent:main:webchat:direct:user-1",
      sessionId: "session-1",
      isNewSession: true,
      resetTriggered: false,
      systemSent: false,
      abortedLastRun: false,
      storePath: "/tmp/session-store.json",
      sessionScope: "per-sender",
      groupResolution: undefined,
      isGroup: false,
      triggerBodyNormalized: "hello",
      bodyStripped: "hello",
    });
  });

  it("drives resolveReplyDirectives → runPreparedReply without shield, reaching runReplyAgent on first-turn message", async () => {
    const result = await getReplyFromConfig(buildFirstTurnWebchatContext(), undefined, {});

    // The real chain executed end-to-end: resolveReplyDirectives returned continuation,
    // handleInlineActions returned continue, runPreparedReply invoked runReplyAgent.
    expect(vi.mocked(runReplyAgent)).toHaveBeenCalledTimes(1);
    // The reply payload propagated back through runPreparedReply.
    expect(result).toEqual({ text: "ok" });

    // runReplyAgent receives the cleaned body. This is the integration-level
    // assertion: the chain compiled the directives (real code) and passed them
    // to runPreparedReply (real code), which called runReplyAgent.
    const call = vi.mocked(runReplyAgent).mock.calls[0]?.[0] as
      | { commandBody?: string; followupRun?: { prompt?: string } }
      | undefined;
    expect(call).toBeTruthy();
    expect(call?.commandBody).toBe("hello");
  });
});
