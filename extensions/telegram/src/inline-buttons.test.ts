import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import {
  isTelegramInlineButtonsEnabled,
  resolveTelegramInlineButtonsScope,
  resolveTelegramTargetChatType,
} from "./inline-buttons.js";

describe("resolveTelegramTargetChatType", () => {
  it("returns 'direct' for positive numeric IDs", () => {
    expect(resolveTelegramTargetChatType("5232990709")).toBe("direct");
    expect(resolveTelegramTargetChatType("123456789")).toBe("direct");
  });

  it("returns 'group' for negative numeric IDs", () => {
    expect(resolveTelegramTargetChatType("-123456789")).toBe("group");
    expect(resolveTelegramTargetChatType("-1001234567890")).toBe("group");
  });

  it("handles telegram: prefix from normalizeTelegramMessagingTarget", () => {
    expect(resolveTelegramTargetChatType("telegram:5232990709")).toBe("direct");
    expect(resolveTelegramTargetChatType("telegram:-123456789")).toBe("group");
    expect(resolveTelegramTargetChatType("TELEGRAM:5232990709")).toBe("direct");
  });

  it("handles tg/group prefixes and topic suffixes", () => {
    expect(resolveTelegramTargetChatType("tg:5232990709")).toBe("direct");
    expect(resolveTelegramTargetChatType("telegram:group:-1001234567890")).toBe("group");
    expect(resolveTelegramTargetChatType("telegram:group:-1001234567890:topic:456")).toBe("group");
    expect(resolveTelegramTargetChatType("-1001234567890:456")).toBe("group");
  });

  it("returns 'unknown' for usernames", () => {
    expect(resolveTelegramTargetChatType("@username")).toBe("unknown");
    expect(resolveTelegramTargetChatType("telegram:@username")).toBe("unknown");
  });

  it("returns 'unknown' for empty strings", () => {
    expect(resolveTelegramTargetChatType("")).toBe("unknown");
    expect(resolveTelegramTargetChatType("   ")).toBe("unknown");
  });
});

describe("resolveTelegramInlineButtonsScope (#75433 SecretRef tolerance)", () => {
  // Embedded prompt prep calls this from raw config before the active runtime
  // snapshot has resolved channel credentials. Read-only account inspection
  // keeps SecretRef-backed config readable without resolving the token.
  it("preserves the default inline-buttons scope when botToken is an unresolved SecretRef", () => {
    const cfg = {
      channels: {
        telegram: {
          botToken: { source: "exec", provider: "default", id: "telegram-token" },
        },
      },
    } as unknown as RemoteClawConfig;

    expect(resolveTelegramInlineButtonsScope({ cfg })).toBe("allowlist");
    expect(isTelegramInlineButtonsEnabled({ cfg })).toBe(true);
  });

  it('preserves configured "off" when botToken is an unresolved SecretRef', () => {
    const cfg = {
      channels: {
        telegram: {
          botToken: { source: "exec", provider: "default", id: "telegram-token" },
          capabilities: { inlineButtons: "off" },
        },
      },
    } as unknown as RemoteClawConfig;

    expect(resolveTelegramInlineButtonsScope({ cfg })).toBe("off");
    expect(isTelegramInlineButtonsEnabled({ cfg })).toBe(false);
  });

  it("preserves scoped account inline-buttons config when the token is an unresolved SecretRef", () => {
    const cfg = {
      channels: {
        telegram: {
          accounts: {
            ops: {
              botToken: { source: "exec", provider: "default", id: "telegram-ops" },
              capabilities: { inlineButtons: "all" },
            },
          },
        },
      },
    } as unknown as RemoteClawConfig;

    expect(resolveTelegramInlineButtonsScope({ cfg, accountId: "ops" })).toBe("all");
    expect(isTelegramInlineButtonsEnabled({ cfg, accountId: "ops" })).toBe(true);
  });
});
