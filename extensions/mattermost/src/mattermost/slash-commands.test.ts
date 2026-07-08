import { describe, expect, it, vi } from "vitest";
import type { MattermostClient } from "./client.js";
import {
  DEFAULT_COMMAND_SPECS,
  findRegisteredCommandForPayload,
  isAuthorizedSlashCommandToken,
  parseSlashCommandPayload,
  registerSlashCommands,
  resolveCallbackUrl,
  resolveCommandText,
  resolveSlashCommandConfig,
  sanitizeSlashLogValue,
} from "./slash-commands.js";
import type {
  MattermostRegisteredCommand,
  MattermostSlashCommandPayload,
} from "./slash-commands.js";

describe("slash-commands", () => {
  async function registerSingleStatusCommand(
    request: (path: string, init?: { method?: string }) => Promise<unknown>,
  ) {
    const client = { request } as unknown as MattermostClient;
    return registerSlashCommands({
      client,
      teamId: "team-1",
      creatorUserId: "bot-user",
      callbackUrl: "http://gateway/callback",
      commands: [
        {
          trigger: "oc_status",
          description: "status",
          autoComplete: true,
        },
      ],
    });
  }

  it("parses application/x-www-form-urlencoded payloads", () => {
    const payload = parseSlashCommandPayload(
      "token=t1&team_id=team&channel_id=ch1&user_id=u1&command=%2Foc_status&text=now",
      "application/x-www-form-urlencoded",
    );
    expect(payload).toEqual({
      token: "t1",
      team_id: "team",
      team_domain: undefined,
      channel_id: "ch1",
      channel_name: undefined,
      user_id: "u1",
      user_name: undefined,
      command: "/oc_status",
      text: "now",
      trigger_id: undefined,
      response_url: undefined,
    });
  });

  it("parses application/json payloads", () => {
    const payload = parseSlashCommandPayload(
      JSON.stringify({
        token: "t2",
        team_id: "team",
        channel_id: "ch2",
        user_id: "u2",
        command: "/oc_model",
        text: "gpt-5",
      }),
      "application/json; charset=utf-8",
    );
    expect(payload).toEqual({
      token: "t2",
      team_id: "team",
      team_domain: undefined,
      channel_id: "ch2",
      channel_name: undefined,
      user_id: "u2",
      user_name: undefined,
      command: "/oc_model",
      text: "gpt-5",
      trigger_id: undefined,
      response_url: undefined,
    });
  });

  it("returns null for malformed payloads missing required fields", () => {
    const payload = parseSlashCommandPayload(
      JSON.stringify({ token: "t3", command: "/oc_help" }),
      "application/json",
    );
    expect(payload).toBeNull();
  });

  it("resolves command text with trigger map fallback", () => {
    const triggerMap = new Map<string, string>([["oc_status", "status"]]);
    expect(resolveCommandText("oc_status", "   ", triggerMap)).toBe("/status");
    expect(resolveCommandText("oc_status", " now ", triggerMap)).toBe("/status now");
    expect(resolveCommandText("oc_models", " openai ", undefined)).toBe("/models openai");
    expect(resolveCommandText("oc_help", "", undefined)).toBe("/help");
  });

  it("registers both public model slash commands", () => {
    expect(
      DEFAULT_COMMAND_SPECS.filter(
        (spec) => spec.trigger === "oc_model" || spec.trigger === "oc_models",
      ).map((spec) => spec.trigger),
    ).toEqual(["oc_model", "oc_models"]);
  });

  it("normalizes callback path in slash config", () => {
    const config = resolveSlashCommandConfig({ callbackPath: "api/channels/mattermost/command" });
    expect(config.callbackPath).toBe("/api/channels/mattermost/command");
  });

  it("falls back to localhost callback URL for wildcard bind hosts", () => {
    const config = resolveSlashCommandConfig({ callbackPath: "/api/channels/mattermost/command" });
    const callbackUrl = resolveCallbackUrl({
      config,
      gatewayPort: 18789,
      gatewayHost: "0.0.0.0",
    });
    expect(callbackUrl).toBe("http://localhost:18789/api/channels/mattermost/command");
  });

  it("reuses existing command when trigger already points to callback URL", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith("/commands?team_id=")) {
        return [
          {
            id: "cmd-1",
            token: "tok-1",
            team_id: "team-1",
            creator_id: "bot-user",
            trigger: "oc_status",
            method: "P",
            url: "http://gateway/callback",
            auto_complete: true,
          },
        ];
      }
      throw new Error(`unexpected request path: ${path}`);
    });
    const result = await registerSingleStatusCommand(request);

    expect(result).toHaveLength(1);
    const firstCommand = result[0];
    if (!firstCommand) {
      throw new Error("expected Mattermost slash command result");
    }
    expect(firstCommand.managed).toBe(false);
    expect(firstCommand.id).toBe("cmd-1");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("skips foreign command trigger collisions instead of mutating non-owned commands", async () => {
    const request = vi.fn(async (path: string, init?: { method?: string }) => {
      if (path.startsWith("/commands?team_id=")) {
        return [
          {
            id: "cmd-foreign-1",
            token: "tok-foreign-1",
            team_id: "team-1",
            creator_id: "another-bot-user",
            trigger: "oc_status",
            method: "P",
            url: "http://foreign/callback",
            auto_complete: true,
          },
        ];
      }
      if (init?.method === "POST" || init?.method === "PUT" || init?.method === "DELETE") {
        throw new Error("should not mutate foreign commands");
      }
      throw new Error(`unexpected request path: ${path}`);
    });
    const result = await registerSingleStatusCommand(request);

    expect(result).toHaveLength(0);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("slash-command token authorization", () => {
  const baseCmd: MattermostRegisteredCommand = {
    id: "cmd-1",
    trigger: "oc_status",
    teamId: "t1",
    token: "known-token",
    url: "https://chat.example.com/callback",
    managed: true,
  };
  const payload = (
    over: Partial<MattermostSlashCommandPayload> = {},
  ): MattermostSlashCommandPayload => ({
    token: "known-token",
    team_id: "t1",
    channel_id: "c1",
    user_id: "u1",
    command: "/oc_status",
    text: "",
    ...over,
  });

  it("finds the registered command by normalized trigger and team", () => {
    const found = findRegisteredCommandForPayload([baseCmd], payload({ command: "/oc_status" }));
    expect(found?.id).toBe("cmd-1");
  });

  it("returns null when the trigger is unknown or the team mismatches", () => {
    expect(
      findRegisteredCommandForPayload([baseCmd], payload({ command: "/oc_unknown" })),
    ).toBeNull();
    expect(findRegisteredCommandForPayload([baseCmd], payload({ team_id: "other" }))).toBeNull();
  });

  it("accepts the exact token for the matching command (constant-time gate)", () => {
    expect(isAuthorizedSlashCommandToken([baseCmd], payload({ token: "known-token" }))).toBe(true);
  });

  it("rejects a wrong-value token", () => {
    expect(isAuthorizedSlashCommandToken([baseCmd], payload({ token: "wrong-token" }))).toBe(false);
  });

  it("rejects a length-mismatch token (exercises the length guard)", () => {
    expect(isAuthorizedSlashCommandToken([baseCmd], payload({ token: "known-tokenX" }))).toBe(
      false,
    );
  });

  it("scopes tokens per command — a token valid for A is rejected on B", () => {
    const a: MattermostRegisteredCommand = {
      ...baseCmd,
      id: "a",
      trigger: "oc_a",
      token: "token-a",
    };
    const b: MattermostRegisteredCommand = {
      ...baseCmd,
      id: "b",
      trigger: "oc_b",
      token: "token-b",
    };
    expect(
      isAuthorizedSlashCommandToken([a, b], payload({ command: "/oc_b", token: "token-a" })),
    ).toBe(false);
    expect(
      isAuthorizedSlashCommandToken([a, b], payload({ command: "/oc_b", token: "token-b" })),
    ).toBe(true);
  });

  it("fails closed when no commands are registered", () => {
    expect(isAuthorizedSlashCommandToken([], payload())).toBe(false);
  });

  it("matches the trigger case-insensitively (MM lowercases registered triggers)", () => {
    const mixed: MattermostRegisteredCommand = {
      ...baseCmd,
      trigger: "oc_MySkill",
      token: "skill-token",
    };
    expect(
      isAuthorizedSlashCommandToken(
        [mixed],
        payload({ command: "/oc_myskill", token: "skill-token" }),
      ),
    ).toBe(true);
  });
});

describe("sanitizeSlashLogValue", () => {
  it("collapses CR/LF/tab to spaces to prevent log injection", () => {
    expect(sanitizeSlashLogValue("line1\r\nline2\tend")).toBe("line1 line2 end");
  });

  it("truncates values beyond the length cap", () => {
    const out = sanitizeSlashLogValue("x".repeat(300), 200);
    expect(out.length).toBe(201); // 200 chars + ellipsis
    expect(out.endsWith("…")).toBe(true);
  });

  it("passes short plain values through unchanged", () => {
    expect(sanitizeSlashLogValue("channel-abc")).toBe("channel-abc");
  });
});
