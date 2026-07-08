import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { resolveCommandAuthorization } from "./command-auth.js";
import type { MsgContext } from "./templating.js";
import { installDiscordRegistryHooks } from "./test-helpers/command-auth-registry-fixture.js";

// Replaces the subsystem logger so the silent-denial debug diagnostic
// (remoteclaw#2825) is observable regardless of the ambient console/file log
// level — `debug` is off by default, so asserting against the real logger's
// console/file output would require raising the level just to observe the call.
// Mirrors the established pattern in src/agents/tool-images.log.test.ts.
const { debugMock } = vi.hoisted(() => ({
  debugMock: vi.fn(),
}));

vi.mock("../logging/subsystem.js", () => {
  const makeLogger = () => ({
    subsystem: "command-auth",
    isEnabled: () => true,
    trace: vi.fn(),
    debug: debugMock,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    raw: vi.fn(),
    child: () => makeLogger(),
  });
  return { createSubsystemLogger: () => makeLogger() };
});

installDiscordRegistryHooks();

describe("senderIsOwner only reflects explicit owner authorization", () => {
  it("does not treat direct-message senders as owners when no ownerAllowFrom is configured", () => {
    const cfg = {
      channels: { discord: {} },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "discord",
      Surface: "discord",
      ChatType: "direct",
      From: "discord:123",
      SenderId: "123",
    } as MsgContext;

    const auth = resolveCommandAuthorization({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(auth.senderIsOwner).toBe(false);
    expect(auth.isAuthorizedSender).toBe(true);
  });

  it("does not treat group-chat senders as owners when no ownerAllowFrom is configured", () => {
    const cfg = {
      channels: { discord: {} },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "discord",
      Surface: "discord",
      ChatType: "group",
      From: "discord:123",
      SenderId: "123",
    } as MsgContext;

    const auth = resolveCommandAuthorization({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(auth.senderIsOwner).toBe(false);
    expect(auth.isAuthorizedSender).toBe(true);
  });

  it("keeps channel-validated native group commands authorized without owner status", () => {
    const cfg = {
      channels: { telegram: {} },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "telegram",
      Surface: "telegram",
      ChatType: "group",
      From: "telegram:group:-100123",
      SenderId: "200482621",
      CommandSource: "native",
    } as MsgContext;

    const auth = resolveCommandAuthorization({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(auth.senderIsOwner).toBe(false);
    expect(auth.isAuthorizedSender).toBe(true);
  });

  it("senderIsOwner is false when ownerAllowFrom is configured and sender does not match", () => {
    const cfg = {
      channels: { discord: {} },
      commands: { ownerAllowFrom: ["456"] },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "discord",
      Surface: "discord",
      From: "discord:789",
      SenderId: "789",
    } as MsgContext;

    const auth = resolveCommandAuthorization({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(auth.senderIsOwner).toBe(false);
  });

  it("does not let native command authorization bypass explicit owner allowlists", () => {
    const cfg = {
      channels: { telegram: {} },
      commands: { ownerAllowFrom: ["456"] },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "telegram",
      Surface: "telegram",
      ChatType: "group",
      From: "telegram:group:-100123",
      SenderId: "200482621",
      CommandSource: "native",
    } as MsgContext;

    const auth = resolveCommandAuthorization({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(auth.senderIsOwner).toBe(false);
    expect(auth.isAuthorizedSender).toBe(false);
  });

  it("senderIsOwner is true when ownerAllowFrom matches sender", () => {
    const cfg = {
      channels: { discord: {} },
      commands: { ownerAllowFrom: ["456"] },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "discord",
      Surface: "discord",
      From: "discord:456",
      SenderId: "456",
    } as MsgContext;

    const auth = resolveCommandAuthorization({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(auth.senderIsOwner).toBe(true);
  });

  it("senderIsOwner is true when ownerAllowFrom is wildcard (*)", () => {
    const cfg = {
      channels: { discord: {} },
      commands: { ownerAllowFrom: ["*"] },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "discord",
      Surface: "discord",
      From: "discord:anyone",
      SenderId: "anyone",
    } as MsgContext;

    const auth = resolveCommandAuthorization({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(auth.senderIsOwner).toBe(true);
  });

  it("senderIsOwner is true for internal operator.admin sessions", () => {
    const cfg = {} as RemoteClawConfig;

    const ctx = {
      Provider: "webchat",
      Surface: "webchat",
      GatewayClientScopes: ["operator.admin"],
    } as MsgContext;

    const auth = resolveCommandAuthorization({
      ctx,
      cfg,
      commandAuthorized: true,
    });

    expect(auth.senderIsOwner).toBe(true);
  });
});

// Owner enforcement (WhatsApp default enforceOwnerForCommands) must deny a
// non-owner regardless of how permissive the allow-lists are. Restores the
// guarantee from upstream OpenClaw #78864, whose literal diff a content-only
// sync dropped because this fork's resolver is inlined rather than split into
// upstream's resolveCommandSenderAuthorization helper. See remoteclaw#2821.
describe("owner enforcement denies non-owner senders under WhatsApp (remoteclaw#2821)", () => {
  it('denies a non-owner WhatsApp sender when channels.whatsapp.allowFrom is ["*"] (the CVE)', () => {
    const cfg = {
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "whatsapp",
      Surface: "whatsapp",
      ChatType: "direct",
      From: "whatsapp:+14155559999",
      SenderId: "+14155559999",
      SenderE164: "+14155559999",
    } as MsgContext;

    const auth = resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });

    expect(auth.isAuthorizedSender).toBe(false);
    expect(auth.senderIsOwner).toBe(false);
  });

  it("denies a non-owner WhatsApp sender when no allowFrom is configured at all", () => {
    const cfg = {
      channels: { whatsapp: {} },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "whatsapp",
      Surface: "whatsapp",
      ChatType: "direct",
      From: "whatsapp:+14155559999",
      SenderId: "+14155559999",
      SenderE164: "+14155559999",
    } as MsgContext;

    const auth = resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });

    expect(auth.isAuthorizedSender).toBe(false);
    expect(auth.senderIsOwner).toBe(false);
  });

  it('authorizes any WhatsApp sender when commands.ownerAllowFrom is ["*"]', () => {
    // The discriminator a naive `!senderIsOwnerByIdentity` gate would fail: the
    // sender is not an identity-matched owner, but ownerAllowFrom: ["*"] makes
    // everyone an owner, so isOwnerForCommands is true and the gate must NOT deny.
    const cfg = {
      channels: { whatsapp: {} },
      commands: { ownerAllowFrom: ["*"] },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "whatsapp",
      Surface: "whatsapp",
      ChatType: "direct",
      From: "whatsapp:+14155559999",
      SenderId: "+14155559999",
      SenderE164: "+14155559999",
    } as MsgContext;

    const auth = resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });

    expect(auth.isAuthorizedSender).toBe(true);
    expect(auth.senderIsOwner).toBe(true);
  });

  it("authorizes an internal operator.admin session even when an owner allowlist excludes it", () => {
    // operator.admin scope is inherently an internal-provider path, so the
    // whatsapp-only enforceOwner default is false here; owner enforcement is
    // active via the configured allowlist. The scope must still pass — a naive
    // `!senderIsOwnerByIdentity` gate (no identity match here) would wrongly deny.
    const cfg = {
      commands: { ownerAllowFrom: ["nonmatching-owner"] },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "webchat",
      Surface: "webchat",
      GatewayClientScopes: ["operator.admin"],
    } as MsgContext;

    const auth = resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });

    expect(auth.isAuthorizedSender).toBe(true);
    expect(auth.senderIsOwner).toBe(true);
  });

  it("denies an arbitrary WhatsApp sender when neither allowFrom nor ownerAllowFrom is set, but authorizes an identity-listed one", () => {
    const arbitraryCtx = {
      Provider: "whatsapp",
      Surface: "whatsapp",
      ChatType: "direct",
      From: "whatsapp:+14155559999",
      SenderId: "+14155559999",
      SenderE164: "+14155559999",
    } as MsgContext;

    const failClosed = resolveCommandAuthorization({
      ctx: arbitraryCtx,
      cfg: { channels: { whatsapp: {} } } as RemoteClawConfig,
      commandAuthorized: true,
    });
    expect(failClosed.isAuthorizedSender).toBe(false);

    // Contrast: the same sender listed in channels.whatsapp.allowFrom is an owner
    // by identity (matchedCommandOwner), so enforcement authorizes it.
    const ownerCtx = {
      Provider: "whatsapp",
      Surface: "whatsapp",
      ChatType: "direct",
      From: "whatsapp:+14155550123",
      SenderId: "+14155550123",
      SenderE164: "+14155550123",
    } as MsgContext;

    const identityOwner = resolveCommandAuthorization({
      ctx: ownerCtx,
      cfg: { channels: { whatsapp: { allowFrom: ["+14155550123"] } } } as RemoteClawConfig,
      commandAuthorized: true,
    });
    expect(identityOwner.isAuthorizedSender).toBe(true);
  });

  it('denies a non-owner even when commands.allowFrom opens commands to all ("*")', () => {
    // Both-paths fidelity: enforcement must override commands.allowFrom too, not
    // only the channel-allowFrom fallback path. Without the top-of-branch gate,
    // commandsAllowAll would authorize this non-owner.
    const cfg = {
      channels: { whatsapp: {} },
      commands: { allowFrom: { "*": ["*"] } },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "whatsapp",
      Surface: "whatsapp",
      ChatType: "direct",
      From: "whatsapp:+14155559999",
      SenderId: "+14155559999",
      SenderE164: "+14155559999",
    } as MsgContext;

    const auth = resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });

    expect(auth.isAuthorizedSender).toBe(false);
  });

  it("warns operators to configure commands.ownerAllowFrom when enforcement locks everyone out", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const cfg = {
        channels: { whatsapp: { allowFrom: ["*"] } },
      } as RemoteClawConfig;

      const ctx = {
        Provider: "whatsapp",
        Surface: "whatsapp",
        ChatType: "direct",
        // Unique AccountId so the module-level dedup key does not collide with the
        // other WhatsApp cliff cases in this file.
        AccountId: "owner-enforcement-cliff-warn-fixture",
        From: "whatsapp:+14155559999",
        SenderId: "+14155559999",
        SenderE164: "+14155559999",
      } as MsgContext;

      const auth = resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });

      expect(auth.isAuthorizedSender).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      expect(
        warnSpy.mock.calls.some((call) => String(call[0]).includes("commands.ownerAllowFrom")),
      ).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("silent-denial diagnostic (remoteclaw#2825)", () => {
  beforeEach(() => {
    debugMock.mockClear();
  });

  it("emits a rate-limited debug diagnostic naming provider + denied sender when an owner IS configured", () => {
    const cfg = {
      channels: { whatsapp: {} },
      commands: { ownerAllowFrom: ["+14155550042"] },
    } as RemoteClawConfig;

    const ctx = {
      Provider: "whatsapp",
      Surface: "whatsapp",
      ChatType: "direct",
      AccountId: "silent-denial-diagnostic-fixture",
      From: "whatsapp:+14155559999",
      SenderId: "+14155559999",
      SenderE164: "+14155559999",
    } as MsgContext;

    const auth = resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });

    expect(auth.isAuthorizedSender).toBe(false);
    expect(auth.senderIsOwner).toBe(false);
    expect(debugMock).toHaveBeenCalledTimes(1);
    const [message, meta] = debugMock.mock.calls[0];
    expect(String(message)).toContain("whatsapp");
    expect(String(message)).toContain("+14155559999");
    expect(meta).toMatchObject({ providerId: "whatsapp", senderId: "+14155559999" });
  });

  it("still fires the fail-closed cliff console.warn exactly once for the no-owner case, and never the new diagnostic", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const cfg = {
        channels: { whatsapp: { allowFrom: ["*"] } },
      } as RemoteClawConfig;

      const ctx = {
        Provider: "whatsapp",
        Surface: "whatsapp",
        ChatType: "direct",
        // Unique AccountId so the module-level dedup key does not collide with the
        // other WhatsApp cliff cases in this file.
        AccountId: "silent-denial-diagnostic-cliff-unchanged-fixture",
        From: "whatsapp:+14155559999",
        SenderId: "+14155559999",
        SenderE164: "+14155559999",
      } as MsgContext;

      // Call twice: the cliff console.warn dedups per-key (process-lifetime), so
      // this also demonstrates the "exactly once" behavior is unchanged by the
      // new diagnostic code path.
      resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });
      const auth = resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });

      expect(auth.isAuthorizedSender).toBe(false);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain("commands.ownerAllowFrom");
      expect(debugMock).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not emit the denial diagnostic for an authorized owner (identity, operator.admin scope, or wildcard ownerAllowFrom)", () => {
    // identity match: sender IS the configured owner.
    const identityCfg = {
      channels: { whatsapp: {} },
      commands: { ownerAllowFrom: ["+14155550042"] },
    } as RemoteClawConfig;

    const identityCtx = {
      Provider: "whatsapp",
      Surface: "whatsapp",
      ChatType: "direct",
      AccountId: "silent-denial-diagnostic-identity-owner-fixture",
      From: "whatsapp:+14155550042",
      SenderId: "+14155550042",
      SenderE164: "+14155550042",
    } as MsgContext;

    const identityAuth = resolveCommandAuthorization({
      ctx: identityCtx,
      cfg: identityCfg,
      commandAuthorized: true,
    });

    expect(identityAuth.isAuthorizedSender).toBe(true);
    expect(debugMock).not.toHaveBeenCalled();

    // operator.admin scope: internal channel sender authorized via GatewayClientScopes.
    const scopeCfg = {
      commands: { ownerAllowFrom: ["nonmatching-owner"] },
    } as RemoteClawConfig;

    const scopeCtx = {
      Provider: "webchat",
      Surface: "webchat",
      GatewayClientScopes: ["operator.admin"],
    } as MsgContext;

    const scopeAuth = resolveCommandAuthorization({
      ctx: scopeCtx,
      cfg: scopeCfg,
      commandAuthorized: true,
    });

    expect(scopeAuth.isAuthorizedSender).toBe(true);
    expect(debugMock).not.toHaveBeenCalled();

    // wildcard ownerAllowFrom: every sender is authorized as owner.
    const wildcardCfg = {
      channels: { whatsapp: {} },
      commands: { ownerAllowFrom: ["*"] },
    } as RemoteClawConfig;

    const wildcardCtx = {
      Provider: "whatsapp",
      Surface: "whatsapp",
      ChatType: "direct",
      AccountId: "silent-denial-diagnostic-wildcard-owner-fixture",
      From: "whatsapp:+14155559999",
      SenderId: "+14155559999",
      SenderE164: "+14155559999",
    } as MsgContext;

    const wildcardAuth = resolveCommandAuthorization({
      ctx: wildcardCtx,
      cfg: wildcardCfg,
      commandAuthorized: true,
    });

    expect(wildcardAuth.isAuthorizedSender).toBe(true);
    expect(debugMock).not.toHaveBeenCalled();
  });

  it("rate-limits repeated denials from the same provider+account within the window to at most one diagnostic", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const cfg = {
        channels: { whatsapp: {} },
        commands: { ownerAllowFrom: ["+14155550042"] },
      } as RemoteClawConfig;

      const ctx = {
        Provider: "whatsapp",
        Surface: "whatsapp",
        ChatType: "direct",
        AccountId: "silent-denial-diagnostic-ratelimit-fixture",
        From: "whatsapp:+14155559999",
        SenderId: "+14155559999",
        SenderE164: "+14155559999",
      } as MsgContext;

      resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });
      resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });
      resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });

      expect(debugMock).toHaveBeenCalledTimes(1);

      // Still inside the same 60s window: no additional diagnostic.
      vi.setSystemTime(new Date("2026-01-01T00:00:59.000Z"));
      resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });

      expect(debugMock).toHaveBeenCalledTimes(1);

      // Past the window: the throttle rolls over and the still-ongoing denial is
      // diagnosable again.
      vi.setSystemTime(new Date("2026-01-01T00:01:01.000Z"));
      resolveCommandAuthorization({ ctx, cfg, commandAuthorized: true });

      expect(debugMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
