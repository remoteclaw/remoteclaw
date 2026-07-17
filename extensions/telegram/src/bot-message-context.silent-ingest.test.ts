import { describe, expect, it, vi } from "vitest";
import { buildTelegramMessageContextForTest } from "./bot-message-context.test-harness.js";

const internalHookMocks = vi.hoisted(() => ({
  createInternalHookEvent: vi.fn(
    (type: string, action: string, sessionKey: string, context: Record<string, unknown>) => ({
      type,
      action,
      sessionKey,
      context,
      timestamp: new Date(),
      messages: [],
    }),
  ),
  triggerInternalHook: vi.fn(async () => undefined),
}));

// Mock target repaired (#2961): the upstream test mocked the
// `remoteclaw/plugin-sdk/hook-runtime` barrel, which does not exist in this fork — it is
// a DEPRECATED plugin-sdk subpath (scripts/lib/plugin-sdk-deprecated-barrel-subpaths.json)
// with no backing `src/plugin-sdk/hook-runtime.ts`, so the mock resolved to nothing and
// never applied. The fork imports the hook primitives from `src/hooks/*` directly — the
// same seam `src/auto-reply/reply/dispatch-from-config.ts` uses — so mock that instead.
// Only the two capture points are stubbed; `fireAndForgetHook` and the real
// `toInternalMessageReceivedContext` mapper deliberately run for real here.
vi.mock("../../../src/hooks/internal-hooks.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/hooks/internal-hooks.js")>();
  return {
    ...actual,
    createInternalHookEvent: internalHookMocks.createInternalHookEvent,
    triggerInternalHook: internalHookMocks.triggerInternalHook,
  };
});

function makeGroupMessage(text: string) {
  return {
    message_id: 42,
    chat: { id: -1001234567890, type: "supergroup" as const, title: "Test Group" },
    date: 1_700_000_000,
    text,
    from: { id: 99, first_name: "Alice", username: "alice" },
  };
}

describe("telegram mention-skip silent ingest", () => {
  it("emits internal message:received when ingest is enabled", async () => {
    internalHookMocks.createInternalHookEvent.mockClear();
    internalHookMocks.triggerInternalHook.mockClear();

    const result = await buildTelegramMessageContextForTest({
      message: makeGroupMessage("hello without mention"),
      cfg: {
        agents: {
          // Fail-closed routing (#2961): without a configured agent the message is
          // dropped as unmatched before it can reach the mention-skip branch at all.
          list: [{ id: "main" }],
          defaults: {
            model: "anthropic/sonnet-4.6",
            workspace: "/tmp/remoteclaw",
          },
        },
        channels: {
          telegram: {
            groups: {
              "*": {
                requireMention: true,
                ingest: true,
              },
            },
          },
        },
        messages: {
          groupChat: {
            mentionPatterns: ["@bot"],
          },
        },
      } as never,
      resolveGroupRequireMention: () => true,
      resolveTelegramGroupConfig: () => ({
        groupConfig: {
          requireMention: true,
          ingest: true,
        },
        topicConfig: undefined,
      }),
    });

    expect(result).toBeNull();
    expect(internalHookMocks.createInternalHookEvent).toHaveBeenCalledWith(
      "message",
      "received",
      expect.stringContaining("telegram"),
      expect.objectContaining({
        channelId: "telegram",
        content: "hello without mention",
      }),
    );
    expect(internalHookMocks.triggerInternalHook).toHaveBeenCalledTimes(1);
  });

  it("uses wildcard ingest when a specific group override omits ingest", async () => {
    internalHookMocks.createInternalHookEvent.mockClear();
    internalHookMocks.triggerInternalHook.mockClear();

    const result = await buildTelegramMessageContextForTest({
      message: makeGroupMessage("hello without mention"),
      cfg: {
        agents: {
          // Fail-closed routing (#2961): without a configured agent the message is
          // dropped as unmatched before it can reach the mention-skip branch at all.
          list: [{ id: "main" }],
          defaults: {
            model: "anthropic/sonnet-4.6",
            workspace: "/tmp/remoteclaw",
          },
        },
        channels: {
          telegram: {
            groups: {
              "*": {
                requireMention: true,
                ingest: true,
              },
              "-1001234567890": {
                requireMention: true,
              },
            },
          },
        },
        messages: {
          groupChat: {
            mentionPatterns: ["@bot"],
          },
        },
      } as never,
      resolveGroupRequireMention: () => true,
      resolveTelegramGroupConfig: () => ({
        groupConfig: {
          requireMention: true,
        },
        topicConfig: undefined,
      }),
    });

    expect(result).toBeNull();
    expect(internalHookMocks.createInternalHookEvent).toHaveBeenCalledWith(
      "message",
      "received",
      expect.stringContaining("telegram"),
      expect.objectContaining({
        channelId: "telegram",
        content: "hello without mention",
      }),
    );
    expect(internalHookMocks.triggerInternalHook).toHaveBeenCalledTimes(1);
  });
});
