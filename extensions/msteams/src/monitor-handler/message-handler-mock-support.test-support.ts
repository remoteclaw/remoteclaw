// Msteams plugin module implements message handler mock support support behavior.
import { vi } from "vitest";

const runtimeApiMockState = vi.hoisted(() => ({
  dispatchReplyFromConfigWithSettledDispatcher: vi.fn(async (params: { ctxPayload: unknown }) => ({
    queuedFinal: false,
    counts: {},
    capturedCtxPayload: params.ctxPayload,
  })),
}));

export function getRuntimeApiMockState() {
  return runtimeApiMockState;
}

vi.mock("remoteclaw/plugin-sdk/msteams", async (importOriginal) => {
  const actual = await importOriginal<typeof import("remoteclaw/plugin-sdk/msteams")>();
  return {
    ...actual,
    dispatchReplyFromConfigWithSettledDispatcher:
      runtimeApiMockState.dispatchReplyFromConfigWithSettledDispatcher,
  };
});

vi.mock("../reply-dispatcher.js", () => ({
  createMSTeamsReplyDispatcher: () => ({
    dispatcher: {},
    replyOptions: {},
    markDispatchIdle: vi.fn(),
  }),
}));
