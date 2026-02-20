import path from "node:path";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import { loadSessionStore } from "../config/sessions.js";
import type { AgentRunLoopResult } from "./reply/agent-runner-execution.js";
import { runAgentTurnWithFallback } from "./reply/agent-runner-execution.js";

export { runAgentTurnWithFallback } from "./reply/agent-runner-execution.js";

export const MAIN_SESSION_KEY = "agent:main:main";

export type ReplyPayloadText = { text?: string | null } | null | undefined;

export function replyText(res: ReplyPayloadText | ReplyPayloadText[]): string | undefined {
  if (Array.isArray(res)) {
    return typeof res[0]?.text === "string" ? res[0]?.text : undefined;
  }
  return typeof res?.text === "string" ? res.text : undefined;
}

export function replyTexts(res: ReplyPayloadText | ReplyPayloadText[]): string[] {
  const payloads = Array.isArray(res) ? res : [res];
  return payloads
    .map((entry) => (typeof entry?.text === "string" ? entry.text : undefined))
    .filter((value): value is string => Boolean(value));
}

export async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(
    async (home) => {
      return await fn(home);
    },
    {
      env: {
        REMOTECLAW_AGENT_DIR: (home) => path.join(home, ".remoteclaw", "agent"),
        PI_CODING_AGENT_DIR: (home) => path.join(home, ".remoteclaw", "agent"),
      },
      prefix: "remoteclaw-reply-",
    },
  );
}

export function sessionStorePath(home: string): string {
  return path.join(home, "sessions.json");
}

export function makeWhatsAppDirectiveConfig(
  home: string,
  defaults: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return {
    agents: {
      defaults: {
        workspace: path.join(home, "remoteclaw"),
        ...defaults,
      },
    },
    channels: { whatsapp: { allowFrom: ["*"] } },
    session: { store: sessionStorePath(home) },
    ...extra,
  };
}

export const AUTHORIZED_WHATSAPP_COMMAND = {
  From: "+1222",
  To: "+1222",
  Provider: "whatsapp",
  SenderE164: "+1222",
  CommandAuthorized: true,
} as const;

export function makeElevatedDirectiveConfig(home: string) {
  return makeWhatsAppDirectiveConfig(
    home,
    {
      model: "anthropic/claude-opus-4-5",
      elevatedDefault: "on",
    },
    {
      tools: {
        elevated: {
          allowFrom: { whatsapp: ["+1222"] },
        },
      },
      channels: { whatsapp: { allowFrom: ["+1222"] } },
      session: { store: sessionStorePath(home) },
    },
  );
}

export function assertModelSelection(
  storePath: string,
  selection: { model?: string; provider?: string } = {},
) {
  const store = loadSessionStore(storePath);
  const entry = store[MAIN_SESSION_KEY];
  expect(entry).toBeDefined();
  expect(entry?.modelOverride).toBe(selection.model);
  expect(entry?.providerOverride).toBe(selection.provider);
}

function makeSuccessResult(text: string): AgentRunLoopResult {
  return {
    kind: "success",
    runResult: {
      text,
      sessionId: "s",
      durationMs: 1,
      usage: undefined,
      aborted: false,
      error: undefined,
    },
    didLogHeartbeatStrip: false,
    autoCompactionCompleted: false,
  };
}

export function installDirectiveBehaviorE2EHooks() {
  beforeEach(() => {
    vi.mocked(runAgentTurnWithFallback).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
}

export function makeRestrictedElevatedDisabledConfig(home: string) {
  return {
    agents: {
      defaults: {
        model: "anthropic/claude-opus-4-5",
        workspace: path.join(home, "remoteclaw"),
      },
      list: [
        {
          id: "restricted",
          tools: {
            elevated: { enabled: false },
          },
        },
      ],
    },
    tools: {
      elevated: {
        allowFrom: { whatsapp: ["+1222"] },
      },
    },
    channels: { whatsapp: { allowFrom: ["+1222"] } },
    session: { store: path.join(home, "sessions.json") },
  } as const;
}

export function mockRunAgentTurnOk(text = "ok") {
  vi.mocked(runAgentTurnWithFallback).mockResolvedValue(makeSuccessResult(text));
}
