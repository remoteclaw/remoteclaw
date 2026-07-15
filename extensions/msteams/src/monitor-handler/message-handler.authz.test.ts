import type { RemoteClawConfig, PluginRuntime, RuntimeEnv } from "remoteclaw/plugin-sdk/msteams";
import { describe, expect, it, vi } from "vitest";
import type { MSTeamsMessageHandlerDeps } from "../monitor-handler.js";
import { setMSTeamsRuntime } from "../runtime.js";
// Mocks the agent-dispatch + reply-dispatcher module surface so the authorized
// message path runs to completion without a real dispatch.
import "./message-handler-mock-support.test-support.js";
import { createMSTeamsMessageHandler } from "./message-handler.js";

describe("msteams monitor handler authz", () => {
  function createDeps(
    cfg: RemoteClawConfig,
    options: {
      hasControlCommand?: PluginRuntime["channel"]["text"]["hasControlCommand"];
    } = {},
  ) {
    const readAllowFromStore = vi.fn(async () => ["attacker-aad"]);
    setMSTeamsRuntime({
      logging: { shouldLogVerbose: () => false },
      channel: {
        debounce: {
          resolveInboundDebounceMs: () => 0,
          createInboundDebouncer: <T>(params: {
            onFlush: (entries: T[]) => Promise<void>;
          }): { enqueue: (entry: T) => Promise<void> } => ({
            enqueue: async (entry: T) => {
              await params.onFlush([entry]);
            },
          }),
        },
        pairing: {
          readAllowFromStore,
          upsertPairingRequest: vi.fn(async () => null),
        },
        text: {
          hasControlCommand: () => false,
        },
        routing: {
          resolveAgentRoute: ({ peer }: { peer: { kind: string; id: string } }) => ({
            sessionKey: `msteams:${peer.kind}:${peer.id}`,
            agentId: "default",
            accountId: "default",
          }),
        },
        reply: {
          formatAgentEnvelope: ({ body }: { body: string }) => body,
          finalizeInboundContext: <T>(ctx: T): T => ctx,
        },
        session: {
          recordInboundSession: vi.fn(async () => undefined),
        },
      },
      system: {
        enqueueSystemEvent: vi.fn(),
      },
    } as unknown as PluginRuntime);

    const conversationStore = {
      upsert: vi.fn(async () => undefined),
    };

    const deps: MSTeamsMessageHandlerDeps = {
      cfg,
      runtime: { error: vi.fn() } as unknown as RuntimeEnv,
      appId: "test-app",
      adapter: {} as MSTeamsMessageHandlerDeps["adapter"],
      tokenProvider: {
        getAccessToken: vi.fn(async () => "token"),
      },
      textLimit: 4000,
      mediaMaxBytes: 1024 * 1024,
      conversationStore:
        conversationStore as unknown as MSTeamsMessageHandlerDeps["conversationStore"],
      pollStore: {
        recordVote: vi.fn(async () => null),
      } as unknown as MSTeamsMessageHandlerDeps["pollStore"],
      log: {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
      } as unknown as MSTeamsMessageHandlerDeps["log"],
    };

    return { conversationStore, deps, readAllowFromStore };
  }

  it("does not treat DM pairing-store entries as group allowlist entries", async () => {
    const { conversationStore, deps, readAllowFromStore } = createDeps({
      channels: {
        msteams: {
          dmPolicy: "pairing",
          allowFrom: [],
          groupPolicy: "allowlist",
          groupAllowFrom: [],
        },
      },
    } as RemoteClawConfig);

    const handler = createMSTeamsMessageHandler(deps);
    await handler({
      activity: {
        id: "msg-1",
        type: "message",
        text: "",
        from: {
          id: "attacker-id",
          aadObjectId: "attacker-aad",
          name: "Attacker",
        },
        recipient: {
          id: "bot-id",
          name: "Bot",
        },
        conversation: {
          id: "19:group@thread.tacv2",
          conversationType: "groupChat",
        },
        channelData: {},
        attachments: [],
      },
      sendActivity: vi.fn(async () => undefined),
    } as unknown as Parameters<typeof handler>[0]);

    expect(readAllowFromStore).toHaveBeenCalledWith({
      channel: "msteams",
      accountId: "default",
    });
    expect(conversationStore.upsert).not.toHaveBeenCalled();
  });

  it("does not widen sender auth when only a teams route allowlist is configured", async () => {
    const { conversationStore, deps } = createDeps({
      channels: {
        msteams: {
          dmPolicy: "pairing",
          allowFrom: [],
          groupPolicy: "allowlist",
          groupAllowFrom: [],
          teams: {
            team123: {
              channels: {
                "19:group@thread.tacv2": { requireMention: false },
              },
            },
          },
        },
      },
    } as RemoteClawConfig);

    const handler = createMSTeamsMessageHandler(deps);
    await handler({
      activity: {
        id: "msg-1",
        type: "message",
        text: "hello",
        from: {
          id: "attacker-id",
          aadObjectId: "attacker-aad",
          name: "Attacker",
        },
        recipient: {
          id: "bot-id",
          name: "Bot",
        },
        conversation: {
          id: "19:group@thread.tacv2",
          conversationType: "groupChat",
        },
        channelData: {
          team: { id: "team123", name: "Team 123" },
          channel: { name: "General" },
        },
        attachments: [],
      },
      sendActivity: vi.fn(async () => undefined),
    } as unknown as Parameters<typeof handler>[0]);

    expect(conversationStore.upsert).not.toHaveBeenCalled();
  });

  it("does not persist blocked serviceUrl hosts in conversation references", async () => {
    const { conversationStore, deps } = createDeps({
      channels: {
        msteams: {
          dmPolicy: "allowlist",
          allowFrom: ["sender-aad"],
        },
      },
    } as RemoteClawConfig);

    const handler = createMSTeamsMessageHandler(deps);
    await handler({
      activity: {
        id: "msg-blocked-service-url",
        type: "message",
        text: "hello",
        from: {
          id: "sender-id",
          aadObjectId: "sender-aad",
          name: "Sender",
        },
        recipient: {
          id: "bot-id",
          name: "Bot",
        },
        conversation: {
          id: "a:personal-chat",
          conversationType: "personal",
        },
        channelId: "msteams",
        serviceUrl: "https://attacker.example.com/teams/",
        channelData: {},
        attachments: [],
      },
      sendActivity: vi.fn(async () => undefined),
    } as unknown as Parameters<typeof handler>[0]);

    expect(conversationStore.upsert).toHaveBeenCalledTimes(1);
    const upsertCalls = conversationStore.upsert.mock.calls as unknown as Array<
      [string, Record<string, unknown>]
    >;
    const storedRef = upsertCalls[0][1];
    expect("serviceUrl" in storedRef).toBe(false);
  });
});
