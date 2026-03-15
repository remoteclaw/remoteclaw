import { describe, expect, it } from "vitest";
import { RemoteClawSchema } from "./zod-schema.js";

describe("ACP binding cutover schema", () => {
  it("accepts top-level typed ACP bindings with per-agent runtime defaults", () => {
    // In this fork, agent.runtime is a string union ("claude"|"codex"|etc.),
    // not an object with .type/.acp properties.
    const parsed = RemoteClawSchema.safeParse({
      agents: {
        list: [
          { id: "main", default: true },
          {
            id: "coding",
            runtime: "codex",
          },
        ],
      },
      bindings: [
        {
          type: "route",
          agentId: "main",
          match: { channel: "discord", accountId: "default" },
        },
        {
          type: "acp",
          agentId: "coding",
          match: {
            channel: "discord",
            accountId: "default",
            peer: { kind: "channel", id: "1478836151241412759" },
          },
          acp: {
            label: "codex-main",
            backend: "acpx",
          },
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects legacy Discord channel-local ACP binding fields", () => {
    const parsed = RemoteClawSchema.safeParse({
      channels: {
        discord: {
          guilds: {
            "1459246755253325866": {
              channels: {
                "1478836151241412759": {
                  bindings: {
                    acp: {
                      agentId: "codex",
                      mode: "persistent",
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects legacy Telegram topic-local ACP binding fields", () => {
    const parsed = RemoteClawSchema.safeParse({
      channels: {
        telegram: {
          groups: {
            "-1001234567890": {
              topics: {
                "42": {
                  bindings: {
                    acp: {
                      agentId: "codex",
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects ACP bindings without a peer conversation target", () => {
    const parsed = RemoteClawSchema.safeParse({
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: { channel: "discord", accountId: "default" },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects ACP bindings on unsupported channels", () => {
    const parsed = RemoteClawSchema.safeParse({
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "slack",
            accountId: "default",
            peer: { kind: "channel", id: "C123456" },
          },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects non-canonical Telegram ACP topic peer IDs", () => {
    const parsed = RemoteClawSchema.safeParse({
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "telegram",
            accountId: "default",
            peer: { kind: "group", id: "42" },
          },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts canonical Feishu ACP DM and topic peer IDs", () => {
    const parsed = OpenClawSchema.safeParse({
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "feishu",
            accountId: "default",
            peer: { kind: "direct", id: "ou_user_123" },
          },
        },
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "feishu",
            accountId: "default",
            peer: { kind: "direct", id: "user_123" },
          },
        },
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "feishu",
            accountId: "default",
            peer: { kind: "group", id: "oc_group_chat:topic:om_topic_root:sender:ou_user_123" },
          },
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects non-canonical Feishu ACP peer IDs", () => {
    const parsed = OpenClawSchema.safeParse({
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "feishu",
            accountId: "default",
            peer: { kind: "group", id: "oc_group_chat:sender:ou_user_123" },
          },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects Feishu ACP DM peer IDs keyed by union id", () => {
    const parsed = OpenClawSchema.safeParse({
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "feishu",
            accountId: "default",
            peer: { kind: "direct", id: "on_union_user_123" },
          },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects Feishu ACP topic peer IDs with non-canonical sender ids", () => {
    const parsed = OpenClawSchema.safeParse({
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "feishu",
            accountId: "default",
            peer: { kind: "group", id: "oc_group_chat:topic:om_topic_root:sender:user_123" },
          },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects bare Feishu group chat ACP peer IDs", () => {
    const parsed = OpenClawSchema.safeParse({
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "feishu",
            accountId: "default",
            peer: { kind: "group", id: "oc_group_chat" },
          },
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});
