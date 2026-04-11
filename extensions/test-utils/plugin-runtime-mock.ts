import type { PluginRuntime } from "remoteclaw/plugin-sdk";
import { vi } from "vitest";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown
    ? T[K]
    : T[K] extends ReadonlyArray<unknown>
      ? T[K]
      : T[K] extends object
        ? DeepPartial<T[K]>
        : T[K];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(base: T, overrides: DeepPartial<T>): T {
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, overrideValue] of Object.entries(overrides as Record<string, unknown>)) {
    if (overrideValue === undefined) {
      continue;
    }
    const baseValue = result[key];
    if (isObject(baseValue) && isObject(overrideValue)) {
      result[key] = mergeDeep(baseValue, overrideValue);
      continue;
    }
    result[key] = overrideValue;
  }
  return result as T;
}

/**
 * Creates a minimal mock of PluginRuntime for extension tests.
 *
 * The mock provides vi.fn() stubs for the most commonly accessed paths.
 * Extensions that need deeper runtime mocking should extend the overrides.
 */
export function createPluginRuntimeMock(overrides: DeepPartial<PluginRuntime> = {}): PluginRuntime {
  const noop = vi.fn();
  const noopAsync = vi.fn().mockResolvedValue(undefined);

  const base: Record<string, unknown> = {
    version: "1.0.0-test",
    config: {
      loadConfig: vi.fn(() => ({})),
      writeConfigFile: noopAsync,
    },
    agent: {
      defaults: { model: "default", provider: "default" },
      resolveAgentDir: vi.fn(() => "/tmp/agent"),
      resolveAgentWorkspaceDir: vi.fn(() => "/tmp/workspace"),
      resolveAgentIdentity: vi.fn(() => ({ name: "test-agent" })),
      resolveThinkingDefault: vi.fn(() => "off"),
      runAgent: noopAsync,
    },
    logging: {
      shouldLogVerbose: vi.fn(() => false),
      getChildLogger: vi.fn(() => ({
        info: noop,
        warn: noop,
        error: noop,
        debug: noop,
        trace: noop,
        fatal: noop,
      })),
    },
    channel: {
      text: {
        hasControlCommand: vi.fn(() => false),
        resolveChunkMode: vi.fn(() => "paragraph"),
        resolveMarkdownTableMode: vi.fn(() => "plain"),
        convertMarkdownTables: vi.fn((text: string) => text),
      },
      reply: {
        finalizeInboundContext: vi.fn((ctx: unknown) => ctx),
        dispatchReplyWithBufferedBlockDispatcher: noopAsync,
        resolveEnvelopeFormatOptions: vi.fn(() => ({})),
        formatAgentEnvelope: vi.fn(() => ""),
      },
      session: {
        resolveStorePath: vi.fn(() => "/tmp/store"),
        readSessionUpdatedAt: vi.fn(() => undefined),
        recordSessionMetaFromInbound: noopAsync,
      },
      routing: {
        resolveAgentRoute: vi.fn(() => ({
          agentId: "main",
          sessionKey: "test-session",
          accountId: "default",
          channel: "test",
          mainSessionKey: "test-session",
          matchedBy: "default",
        })),
      },
      commands: {
        shouldComputeCommandAuthorized: vi.fn(() => false),
        shouldHandleTextCommands: vi.fn(() => false),
        resolveCommandAuthorizedFromAuthorizers: vi.fn(() => undefined),
        isControlCommandMessage: vi.fn(() => false),
      },
      reactions: {
        shouldAckReaction: vi.fn(() => true),
        removeAckReactionAfterReply: vi.fn(),
      },
      debounce: {
        createInboundDebouncer: vi.fn(
          (params: {
            onFlush: (items: unknown[]) => Promise<void>;
            onError?: (err: unknown) => void;
          }) => ({
            enqueue: vi.fn(async (item: unknown) => {
              try {
                await params.onFlush([item]);
              } catch (err) {
                params.onError?.(err);
              }
            }),
            flushKey: noopAsync,
          }),
        ),
        resolveInboundDebounceMs: vi.fn(() => 500),
      },
      logging: {
        shouldLogVerbose: vi.fn(() => false),
      },
    },
  };

  return mergeDeep(base as PluginRuntime, overrides);
}
