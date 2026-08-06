// Focused ACP reset-suppression specs for initSessionState (#2929).
//
// These 6 cases were re-homed VERBATIM from session.test.ts, which stays in
// vitest.quarantine.ts on an unrelated webchat-routing cluster (#47745). Keeping
// them here means the /new and /reset behavior gates CI instead of riding along
// with a quarantined file — the #2953/#2970 focused-spec re-homing precedent.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildConfiguredAcpSessionKey } from "../../acp/persistent-bindings.js";
import type { RemoteClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import {
  __testing as sessionBindingTesting,
  registerSessionBindingAdapter,
} from "../../infra/outbound/session-binding-service.js";
import { initSessionState } from "./session.js";

// Perf: session-store locks are exercised elsewhere; most session tests don't need FS lock files.
vi.mock("../../agents/session-write-lock.js", () => ({
  acquireSessionWriteLock: async () => ({ release: async () => {} }),
}));

let suiteRoot = "";
let suiteCase = 0;

beforeAll(async () => {
  suiteRoot = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-acp-reset-suite-"));
});

afterAll(async () => {
  await fs.rm(suiteRoot, { recursive: true, force: true });
  suiteRoot = "";
  suiteCase = 0;
});

async function makeCaseDir(prefix: string): Promise<string> {
  const dir = path.join(suiteRoot, `${prefix}${++suiteCase}`);
  await fs.mkdir(dir);
  return dir;
}

async function writeSessionStoreFast(
  storePath: string,
  store: Record<string, SessionEntry | Record<string, unknown>>,
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store), "utf-8");
}

describe("initSessionState ACP reset suppression", () => {
  it("does not rotate local session state for /new on bound ACP sessions", async () => {
    const root = await makeCaseDir("remoteclaw-rawbody-acp-reset-");
    const storePath = path.join(root, "sessions.json");
    const sessionKey = "agent:codex:acp:binding:discord:default:feedface";
    const existingSessionId = "session-existing";
    const now = Date.now();

    await writeSessionStoreFast(storePath, {
      [sessionKey]: {
        sessionId: existingSessionId,
        updatedAt: now,
        systemSent: true,
      },
    });

    const cfg = {
      session: { store: storePath },
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "discord",
            accountId: "default",
            peer: { kind: "channel", id: "1478836151241412759" },
          },
          acp: { mode: "persistent" },
        },
      ],
      channels: {
        discord: {
          allowFrom: ["*"],
        },
      },
    } as RemoteClawConfig;

    const result = await initSessionState({
      ctx: {
        RawBody: "/new",
        CommandBody: "/new",
        Provider: "discord",
        Surface: "discord",
        SenderId: "12345",
        From: "discord:12345",
        To: "1478836151241412759",
        SessionKey: sessionKey,
      },
      cfg,
      commandAuthorized: true,
    });

    expect(result.resetTriggered).toBe(false);
    expect(result.sessionId).toBe(existingSessionId);
    expect(result.isNewSession).toBe(false);
  });

  it("does not rotate local session state for ACP /new when conversation IDs are unavailable", async () => {
    const root = await makeCaseDir("remoteclaw-rawbody-acp-reset-no-conversation-");
    const storePath = path.join(root, "sessions.json");
    const sessionKey = "agent:codex:acp:binding:discord:default:feedface";
    const existingSessionId = "session-existing";
    const now = Date.now();

    await writeSessionStoreFast(storePath, {
      [sessionKey]: {
        sessionId: existingSessionId,
        updatedAt: now,
        systemSent: true,
      },
    });

    const cfg = {
      session: { store: storePath },
      channels: {
        discord: {
          allowFrom: ["*"],
        },
      },
    } as RemoteClawConfig;

    const result = await initSessionState({
      ctx: {
        RawBody: "/new",
        CommandBody: "/new",
        Provider: "discord",
        Surface: "discord",
        SenderId: "12345",
        From: "discord:12345",
        To: "user:12345",
        OriginatingTo: "user:12345",
        SessionKey: sessionKey,
      },
      cfg,
      commandAuthorized: true,
    });

    expect(result.resetTriggered).toBe(false);
    expect(result.sessionId).toBe(existingSessionId);
    expect(result.isNewSession).toBe(false);
  });

  it("keeps custom reset triggers working on bound ACP sessions", async () => {
    const root = await makeCaseDir("remoteclaw-rawbody-acp-custom-reset-");
    const storePath = path.join(root, "sessions.json");
    const sessionKey = "agent:codex:acp:binding:discord:default:feedface";
    const existingSessionId = "session-existing";
    const now = Date.now();

    await writeSessionStoreFast(storePath, {
      [sessionKey]: {
        sessionId: existingSessionId,
        updatedAt: now,
        systemSent: true,
      },
    });

    const cfg = {
      session: {
        store: storePath,
        resetTriggers: ["/fresh"],
      },
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "discord",
            accountId: "default",
            peer: { kind: "channel", id: "1478836151241412759" },
          },
          acp: { mode: "persistent" },
        },
      ],
      channels: {
        discord: {
          allowFrom: ["*"],
        },
      },
    } as RemoteClawConfig;

    const result = await initSessionState({
      ctx: {
        RawBody: "/fresh",
        CommandBody: "/fresh",
        Provider: "discord",
        Surface: "discord",
        SenderId: "12345",
        From: "discord:12345",
        To: "1478836151241412759",
        SessionKey: sessionKey,
      },
      cfg,
      commandAuthorized: true,
    });

    expect(result.resetTriggered).toBe(true);
    expect(result.isNewSession).toBe(true);
    expect(result.sessionId).not.toBe(existingSessionId);
  });

  it("keeps normal /new behavior for unbound ACP-shaped session keys", async () => {
    const root = await makeCaseDir("remoteclaw-rawbody-acp-unbound-reset-");
    const storePath = path.join(root, "sessions.json");
    const sessionKey = "agent:codex:acp:binding:discord:default:feedface";
    const existingSessionId = "session-existing";
    const now = Date.now();

    await writeSessionStoreFast(storePath, {
      [sessionKey]: {
        sessionId: existingSessionId,
        updatedAt: now,
        systemSent: true,
      },
    });

    const cfg = {
      session: { store: storePath },
      channels: {
        discord: {
          allowFrom: ["*"],
        },
      },
    } as RemoteClawConfig;

    const result = await initSessionState({
      ctx: {
        RawBody: "/new",
        CommandBody: "/new",
        Provider: "discord",
        Surface: "discord",
        SenderId: "12345",
        From: "discord:12345",
        To: "1478836151241412759",
        SessionKey: sessionKey,
      },
      cfg,
      commandAuthorized: true,
    });

    expect(result.resetTriggered).toBe(true);
    expect(result.isNewSession).toBe(true);
    expect(result.sessionId).not.toBe(existingSessionId);
  });

  it("does not suppress /new when active conversation binding points to a non-ACP session", async () => {
    const root = await makeCaseDir("remoteclaw-rawbody-acp-nonacp-binding-");
    const storePath = path.join(root, "sessions.json");
    const sessionKey = "agent:codex:acp:binding:discord:default:feedface";
    const existingSessionId = "session-existing";
    const now = Date.now();
    const channelId = "1478836151241412759";
    const nonAcpFocusSessionKey = "agent:main:discord:channel:focus-target";

    await writeSessionStoreFast(storePath, {
      [sessionKey]: {
        sessionId: existingSessionId,
        updatedAt: now,
        systemSent: true,
      },
    });

    const cfg = {
      session: { store: storePath },
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "discord",
            accountId: "default",
            peer: { kind: "channel", id: channelId },
          },
          acp: { mode: "persistent" },
        },
      ],
      channels: {
        discord: {
          allowFrom: ["*"],
        },
      },
    } as RemoteClawConfig;

    sessionBindingTesting.resetSessionBindingAdaptersForTests();
    registerSessionBindingAdapter({
      channel: "discord",
      accountId: "default",
      capabilities: { bindSupported: false, unbindSupported: false, placements: ["current"] },
      listBySession: () => [],
      resolveByConversation: (ref) => {
        if (ref.conversationId !== channelId) {
          return null;
        }
        return {
          bindingId: "focus-binding",
          targetSessionKey: nonAcpFocusSessionKey,
          targetKind: "session",
          conversation: {
            channel: "discord",
            accountId: "default",
            conversationId: channelId,
          },
          status: "active",
          boundAt: now,
        };
      },
    });
    try {
      const result = await initSessionState({
        ctx: {
          RawBody: "/new",
          CommandBody: "/new",
          Provider: "discord",
          Surface: "discord",
          SenderId: "12345",
          From: "discord:12345",
          To: channelId,
          SessionKey: sessionKey,
        },
        cfg,
        commandAuthorized: true,
      });

      expect(result.resetTriggered).toBe(true);
      expect(result.isNewSession).toBe(true);
      expect(result.sessionId).not.toBe(existingSessionId);
    } finally {
      sessionBindingTesting.resetSessionBindingAdaptersForTests();
    }
  });

  it("does not suppress /new when active target session key is non-ACP even with configured ACP binding", async () => {
    const root = await makeCaseDir("remoteclaw-rawbody-acp-configured-fallback-target-");
    const storePath = path.join(root, "sessions.json");
    const channelId = "1478836151241412759";
    const fallbackSessionKey = "agent:main:discord:channel:focus-target";
    const existingSessionId = "session-existing";
    const now = Date.now();

    await writeSessionStoreFast(storePath, {
      [fallbackSessionKey]: {
        sessionId: existingSessionId,
        updatedAt: now,
        systemSent: true,
      },
    });

    const cfg = {
      session: { store: storePath },
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "discord",
            accountId: "default",
            peer: { kind: "channel", id: channelId },
          },
          acp: { mode: "persistent" },
        },
      ],
      channels: {
        discord: {
          allowFrom: ["*"],
        },
      },
    } as RemoteClawConfig;

    const result = await initSessionState({
      ctx: {
        RawBody: "/new",
        CommandBody: "/new",
        Provider: "discord",
        Surface: "discord",
        SenderId: "12345",
        From: "discord:12345",
        To: channelId,
        SessionKey: fallbackSessionKey,
      },
      cfg,
      commandAuthorized: true,
    });

    expect(result.resetTriggered).toBe(true);
    expect(result.isNewSession).toBe(true);
    expect(result.sessionId).not.toBe(existingSessionId);
  });
});

// Authored for #2929: the specs above only pin WHEN the local reset is
// suppressed. These pin that a suppressed reset is handed off rather than
// dropped — without the handoff the command is a silent no-op.
describe("initSessionState hands a suppressed reset to the ACP runtime", () => {
  async function runBoundAcpReset(
    trigger: string,
  ): Promise<Awaited<ReturnType<typeof initSessionState>>> {
    const root = await makeCaseDir("remoteclaw-acp-handoff-");
    const storePath = path.join(root, "sessions.json");
    const sessionKey = "agent:codex:acp:binding:discord:default:feedface";
    const channelId = "1478836151241412759";

    await writeSessionStoreFast(storePath, {
      [sessionKey]: {
        sessionId: "session-existing",
        updatedAt: Date.now(),
        systemSent: true,
      },
    });

    const cfg = {
      session: { store: storePath },
      bindings: [
        {
          type: "acp",
          agentId: "codex",
          match: {
            channel: "discord",
            accountId: "default",
            peer: { kind: "channel", id: channelId },
          },
          acp: { mode: "persistent" },
        },
      ],
      channels: { discord: { allowFrom: ["*"] } },
    } as RemoteClawConfig;

    return initSessionState({
      ctx: {
        RawBody: trigger,
        CommandBody: trigger,
        Provider: "discord",
        Surface: "discord",
        SenderId: "12345",
        From: "discord:12345",
        To: channelId,
        SessionKey: sessionKey,
      },
      cfg,
      commandAuthorized: true,
    });
  }

  // The handoff must target the CONFIGURED binding's canonical session key, not
  // whatever arbitrary ACP-shaped key the turn arrived on.
  const boundSessionKey = buildConfiguredAcpSessionKey({
    channel: "discord",
    accountId: "default",
    conversationId: "1478836151241412759",
    agentId: "codex",
    mode: "persistent",
  });

  it("reports the bound ACP session key and reason for /new", async () => {
    const result = await runBoundAcpReset("/new");

    expect(result.resetTriggered).toBe(false);
    expect(result.acpInPlaceReset).toEqual({
      sessionKey: boundSessionKey,
      reason: "new",
    });
  });

  it("reports the bound ACP session key and reason for /reset", async () => {
    const result = await runBoundAcpReset("/reset");

    expect(result.resetTriggered).toBe(false);
    expect(result.acpInPlaceReset).toEqual({
      sessionKey: boundSessionKey,
      reason: "reset",
    });
  });

  it("does not claim a handoff when the local session was reset normally", async () => {
    const root = await makeCaseDir("remoteclaw-acp-handoff-none-");
    const storePath = path.join(root, "sessions.json");
    const sessionKey = "agent:main:discord:channel:24680";

    await writeSessionStoreFast(storePath, {
      [sessionKey]: {
        sessionId: "session-existing",
        updatedAt: Date.now(),
      },
    });

    const result = await initSessionState({
      ctx: {
        RawBody: "/new",
        CommandBody: "/new",
        Provider: "discord",
        Surface: "discord",
        SenderId: "12345",
        From: "discord:12345",
        To: "24680",
        SessionKey: sessionKey,
      },
      cfg: {
        session: { store: storePath },
        channels: { discord: { allowFrom: ["*"] } },
      } as RemoteClawConfig,
      commandAuthorized: true,
    });

    expect(result.resetTriggered).toBe(true);
    expect(result.acpInPlaceReset).toBeUndefined();
  });
});
