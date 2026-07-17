import { beforeEach, describe, expect, it, vi } from "vitest";
import { zalouserPlugin } from "./channel.js";
import { setZalouserRuntime } from "./runtime.js";
import { sendMessageZalouser, sendReactionZalouser } from "./send.js";

vi.mock("./send.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    sendMessageZalouser: vi.fn(async () => ({ ok: true, messageId: "mid-1" })),
    sendReactionZalouser: vi.fn(async () => ({ ok: true })),
  };
});

const mockSendMessage = vi.mocked(sendMessageZalouser);
const mockSendReaction = vi.mocked(sendReactionZalouser);

function getResolveToolPolicy() {
  const resolveToolPolicy = zalouserPlugin.groups?.resolveToolPolicy;
  expect(resolveToolPolicy).toBeTypeOf("function");
  if (!resolveToolPolicy) {
    throw new Error("resolveToolPolicy unavailable");
  }
  return resolveToolPolicy;
}

function resolveGroupToolPolicy(
  groups: Record<string, { tools: { allow?: string[]; deny?: string[] } }>,
  groupId: string,
) {
  return getResolveToolPolicy()({
    cfg: {
      channels: {
        zalouser: {
          groups,
        },
      },
    },
    accountId: "default",
    groupId,
    groupChannel: groupId,
  });
}

// Resolves the tool policy with a group id and a DISTINCT, attacker-mutable display name
// (groupChannel), optionally opting into the spoofable name-matching behavior. Used by the
// #2976 spoofable-name necropsy specs below.
function resolveGroupToolPolicyWithName(params: {
  groups: Record<string, { tools?: { allow?: string[]; deny?: string[] } }>;
  groupId: string;
  groupChannel: string;
  dangerouslyAllowNameMatching?: boolean;
}) {
  return getResolveToolPolicy()({
    cfg: {
      channels: {
        zalouser: {
          ...(params.dangerouslyAllowNameMatching ? { dangerouslyAllowNameMatching: true } : {}),
          groups: params.groups,
        },
      },
    },
    accountId: "default",
    groupId: params.groupId,
    groupChannel: params.groupChannel,
  });
}

// Same spoofable-name setup as resolveGroupToolPolicyWithName, but for the requireMention consumer
// of the shared resolveZalouserGroupPolicyEntry — mention-gating is the second privilege surface a
// spoofed name could inherit (a trusted entry's requireMention:false). Used by the #2976 specs.
function resolveRequireMentionWithName(params: {
  groups: Record<string, { requireMention?: boolean }>;
  groupId: string;
  groupChannel: string;
  dangerouslyAllowNameMatching?: boolean;
}) {
  const resolveRequireMention = zalouserPlugin.groups?.resolveRequireMention;
  expect(resolveRequireMention).toBeTypeOf("function");
  if (!resolveRequireMention) {
    throw new Error("resolveRequireMention unavailable");
  }
  return resolveRequireMention({
    cfg: {
      channels: {
        zalouser: {
          ...(params.dangerouslyAllowNameMatching ? { dangerouslyAllowNameMatching: true } : {}),
          groups: params.groups,
        },
      },
    },
    accountId: "default",
    groupId: params.groupId,
    groupChannel: params.groupChannel,
  });
}

describe("zalouser outbound", () => {
  beforeEach(() => {
    mockSendMessage.mockClear();
    setZalouserRuntime({
      channel: {
        text: {
          resolveChunkMode: vi.fn(() => "newline"),
          resolveTextChunkLimit: vi.fn(() => 10),
        },
      },
    } as never);
  });

  it("passes markdown chunk settings through sendText", async () => {
    const sendText = zalouserPlugin.outbound?.sendText;
    expect(sendText).toBeTypeOf("function");
    if (!sendText) {
      return;
    }

    const result = await sendText({
      cfg: { channels: { zalouser: { enabled: true } } } as never,
      to: "group:123456",
      text: "hello world\nthis is a test",
      accountId: "default",
    } as never);

    expect(mockSendMessage).toHaveBeenCalledWith(
      "123456",
      "hello world\nthis is a test",
      expect.objectContaining({
        profile: "default",
        isGroup: true,
        textMode: "markdown",
        textChunkMode: "newline",
        textChunkLimit: 10,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        channel: "zalouser",
        messageId: "mid-1",
        ok: true,
      }),
    );
  });
});

describe("zalouser channel policies", () => {
  beforeEach(() => {
    mockSendReaction.mockClear();
    mockSendReaction.mockResolvedValue({ ok: true });
  });

  it("resolves requireMention from group config", () => {
    const resolveRequireMention = zalouserPlugin.groups?.resolveRequireMention;
    expect(resolveRequireMention).toBeTypeOf("function");
    if (!resolveRequireMention) {
      return;
    }
    const requireMention = resolveRequireMention({
      cfg: {
        channels: {
          zalouser: {
            groups: {
              "123": { requireMention: false },
            },
          },
        },
      },
      accountId: "default",
      groupId: "123",
      groupChannel: "123",
    });
    expect(requireMention).toBe(false);
  });

  it("resolves group tool policy by explicit group id", () => {
    const policy = resolveGroupToolPolicy({ "123": { tools: { allow: ["search"] } } }, "123");
    expect(policy).toEqual({ allow: ["search"] });
  });

  it("falls back to wildcard group policy", () => {
    const policy = resolveGroupToolPolicy({ "*": { tools: { deny: ["system.run"] } } }, "missing");
    expect(policy).toEqual({ deny: ["system.run"] });
  });

  it("handles react action", async () => {
    const actions = zalouserPlugin.actions;
    expect(actions?.listActions?.({ cfg: { channels: { zalouser: { enabled: true } } } })).toEqual([
      "react",
    ]);
    const result = await actions?.handleAction?.({
      channel: "zalouser",
      action: "react",
      params: {
        threadId: "123456",
        messageId: "111",
        cliMsgId: "222",
        emoji: "👍",
      },
      cfg: {
        channels: {
          zalouser: {
            enabled: true,
            profile: "default",
          },
        },
      },
    });
    expect(mockSendReaction).toHaveBeenCalledWith({
      profile: "default",
      threadId: "123456",
      isGroup: false,
      msgId: "111",
      cliMsgId: "222",
      emoji: "👍",
      remove: false,
    });
    expect(result).toBeDefined();
  });
});

// Necropsy regression specs for #2976 (post-admission tool-policy inheritance via a spoofable
// group name). resolveZalouserGroupPolicyEntry resolved the policy entry with the group's mutable
// display name (groupChannel) as an unconditional match candidate — unlike the inbound-admission
// path (monitor.ts), which was hardened by #2953 to gate name matching on
// dangerouslyAllowNameMatching. The helper buildZalouserGroupCandidates already honored
// allowNameMatching:false (green in group-policy.test.ts throughout the vulnerable window); the
// defect was the caller wiring in channel.ts, so these specs exercise the plugin's
// resolveToolPolicy consumer rather than the helper.
describe("zalouser group tool policy — spoofable-name gating (#2976)", () => {
  it("does NOT inherit a trusted entry's tools when a spoofable group name impersonates it", () => {
    // Attacker's real (non-allowlisted) group id, whose mutable display name has been set to
    // impersonate the allowlisted "Trusted Team" entry. Pre-fix, "Trusted Team" was a match
    // candidate and the attacker inherited system.run; post-fix (name matching off by default),
    // only the stable id / wildcard resolve, so nothing matches.
    const policy = resolveGroupToolPolicyWithName({
      groups: { "Trusted Team": { tools: { allow: ["system.run"] } } },
      groupId: "g-attacker-001",
      groupChannel: "Trusted Team",
    });
    expect(policy).toBeUndefined();
  });

  it("still resolves by group name when dangerouslyAllowNameMatching is explicitly enabled", () => {
    // The break-glass opt-in is unchanged: an operator who accepts mutable-name matching still
    // gets it. Guards against over-correcting the fix into "names never match".
    const policy = resolveGroupToolPolicyWithName({
      groups: { "Trusted Team": { tools: { allow: ["system.run"] } } },
      groupId: "g-attacker-001",
      groupChannel: "Trusted Team",
      dangerouslyAllowNameMatching: true,
    });
    expect(policy).toEqual({ allow: ["system.run"] });
  });

  it("still resolves by stable group id with name matching disabled (no regression)", () => {
    const policy = resolveGroupToolPolicyWithName({
      groups: { "g-real-001": { tools: { allow: ["search"] } } },
      groupId: "g-real-001",
      groupChannel: "Some Display Name",
    });
    expect(policy).toEqual({ allow: ["search"] });
  });

  it("still resolves the wildcard group policy with name matching disabled (no regression)", () => {
    const policy = resolveGroupToolPolicyWithName({
      groups: { "*": { tools: { deny: ["system.run"] } } },
      groupId: "g-attacker-001",
      groupChannel: "Trusted Team",
    });
    expect(policy).toEqual({ deny: ["system.run"] });
  });

  it("does NOT inherit a trusted entry's requireMention via a spoofable group name (fail-closed)", () => {
    // requireMention is the second surface reached through the same resolver: pre-fix the spoofed
    // name matched "Trusted Team" and inherited requireMention:false (bot replies without a
    // mention); post-fix the name is not a candidate, so it falls back to the fail-closed default.
    const requireMention = resolveRequireMentionWithName({
      groups: { "Trusted Team": { requireMention: false } },
      groupId: "g-attacker-001",
      groupChannel: "Trusted Team",
    });
    expect(requireMention).toBe(true);
  });

  it("still honors requireMention by group name when dangerouslyAllowNameMatching is enabled", () => {
    const requireMention = resolveRequireMentionWithName({
      groups: { "Trusted Team": { requireMention: false } },
      groupId: "g-attacker-001",
      groupChannel: "Trusted Team",
      dangerouslyAllowNameMatching: true,
    });
    expect(requireMention).toBe(false);
  });
});
