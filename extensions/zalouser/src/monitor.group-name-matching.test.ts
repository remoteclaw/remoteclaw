import type { RemoteClawConfig, PluginRuntime } from "remoteclaw/plugin-sdk/zalouser";
import { describe, expect, it, vi } from "vitest";
import "./monitor.send-mocks.js";
import { __testing } from "./monitor.js";
import { setZalouserRuntime } from "./runtime.js";
import { createZalouserRuntimeEnv } from "./test-helpers.js";
import type { ResolvedZalouserAccount, ZaloInboundMessage } from "./types.js";

// Focused regression spec for #2953 (group-allowlist bypass via mutable group-name
// impersonation). The paired assertions also live in monitor.group-gating.test.ts, but that
// file is quarantined on two UNRELATED source regressions (outbound chunking + open-policy DM
// routing) and therefore never runs in CI — so this security behavior is gated here instead.
// Same pattern as the #2927/#2930/#2932 focused specs (see vitest.quarantine.ts).
//
// This must exercise processMessage, not buildZalouserGroupCandidates: the helper already
// honors allowNameMatching:false and its (green, non-quarantined) unit test in
// group-policy.test.ts passed throughout the vulnerable window. The defect was in the caller
// wiring, which only an end-to-end enforcement-path test can catch.

function installRuntime() {
  const dispatchReplyWithBufferedBlockDispatcher = vi.fn(async ({ dispatcherOptions, ctx }) => {
    await dispatcherOptions.typingCallbacks?.onReplyStart?.();
    return { queuedFinal: false, counts: { tool: 0, block: 0, final: 0 }, ctx };
  });

  setZalouserRuntime({
    logging: {
      shouldLogVerbose: () => false,
    },
    channel: {
      commands: {
        shouldComputeCommandAuthorized: vi.fn((body: string) => body.trim().startsWith("/")),
        resolveCommandAuthorizedFromAuthorizers: vi.fn(() => false),
        isControlCommandMessage: vi.fn((body: string) => body.trim().startsWith("/")),
        shouldHandleTextCommands: vi.fn(() => true),
      },
      mentions: {
        buildMentionRegexes: vi.fn(() => []),
        matchesMentionWithExplicit: vi.fn(
          (input) => input.explicit?.isExplicitlyMentioned === true,
        ),
      },
      groups: {
        resolveRequireMention: vi.fn(() => false),
      },
      routing: {
        buildAgentSessionKey: vi.fn(() => "agent:main:zalouser:group:g-attacker-001"),
        resolveAgentRoute: vi.fn(() => ({
          agentId: "main",
          sessionKey: "agent:main:zalouser:group:g-attacker-001",
          accountId: "default",
          mainSessionKey: "agent:main:main",
        })),
      },
      session: {
        resolveStorePath: vi.fn(() => "/tmp"),
        readSessionUpdatedAt: vi.fn(() => undefined),
        recordInboundSession: vi.fn(async () => {}),
      },
      reply: {
        resolveEnvelopeFormatOptions: vi.fn(() => undefined),
        formatAgentEnvelope: vi.fn(({ body }) => body),
        finalizeInboundContext: vi.fn((ctx) => ctx),
        dispatchReplyWithBufferedBlockDispatcher,
      },
    },
  } as unknown as PluginRuntime);

  return { dispatchReplyWithBufferedBlockDispatcher };
}

function createConfig(): RemoteClawConfig {
  return { channels: { zalouser: { enabled: true } } };
}

/**
 * An inbound message from `g-attacker-001` — a group the operator never allowlisted — whose
 * mutable display name has been set to impersonate the allowlisted "Trusted Team" entry.
 */
function createImpersonatingGroupMessage(): ZaloInboundMessage {
  return {
    threadId: "g-attacker-001",
    isGroup: true,
    senderId: "666",
    senderName: "Mallory",
    groupName: "Trusted Team",
    content: "ping @bot",
    timestampMs: Date.now(),
    msgId: "m-attacker-1",
    hasAnyMention: true,
    wasExplicitlyMentioned: true,
    canResolveExplicitMention: true,
    implicitMention: false,
    raw: { source: "test" },
  };
}

function createAccount(dangerouslyAllowNameMatching?: boolean): ResolvedZalouserAccount {
  return {
    accountId: "default",
    enabled: true,
    profile: "default",
    authenticated: true,
    config: {
      ...(dangerouslyAllowNameMatching ? { dangerouslyAllowNameMatching: true } : {}),
      groupPolicy: "allowlist",
      // Permissive within-group sender policy: the operator is treating the group boundary
      // itself as the access control, which is what makes the bypass reach agent dispatch.
      groupAllowFrom: ["*"],
      groups: {
        "group:g-trusted-001": { allow: true },
        "Trusted Team": { allow: true },
      },
    },
  };
}

async function dispatchImpersonatingGroupMessage(dangerouslyAllowNameMatching?: boolean) {
  const { dispatchReplyWithBufferedBlockDispatcher } = installRuntime();
  await __testing.processMessage({
    message: createImpersonatingGroupMessage(),
    account: createAccount(dangerouslyAllowNameMatching),
    config: createConfig(),
    runtime: createZalouserRuntimeEnv(),
  });
  return dispatchReplyWithBufferedBlockDispatcher;
}

describe("zalouser group allowlist name matching (#2953)", () => {
  it("drops a group whose id is not allowlisted but whose mutable name impersonates a trusted entry", async () => {
    const dispatchReplyWithBufferedBlockDispatcher = await dispatchImpersonatingGroupMessage();
    expect(dispatchReplyWithBufferedBlockDispatcher).not.toHaveBeenCalled();
  });

  it("admits the impersonating group only when dangerouslyAllowNameMatching is opted into", async () => {
    const dispatchReplyWithBufferedBlockDispatcher = await dispatchImpersonatingGroupMessage(true);
    expect(dispatchReplyWithBufferedBlockDispatcher).toHaveBeenCalledTimes(1);
    const callArg = dispatchReplyWithBufferedBlockDispatcher.mock.calls[0]?.[0];
    expect(callArg?.ctx?.To).toBe("zalouser:group:g-attacker-001");
  });
});
