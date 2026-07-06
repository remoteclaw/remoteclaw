import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import type { RemoteClawConfig, RuntimeEnv } from "remoteclaw/plugin-sdk/mattermost";
import { describe, expect, it } from "vitest";
import type { ResolvedMattermostAccount } from "./accounts.js";
import type { MattermostRegisteredCommand } from "./slash-commands.js";
import { createSlashCommandHttpHandler } from "./slash-http.js";

function createRequest(params: {
  method?: string;
  body?: string;
  contentType?: string;
  keepOpen?: boolean;
}): IncomingMessage {
  const req = new PassThrough();
  const incoming = req as unknown as IncomingMessage;
  incoming.method = params.method ?? "POST";
  incoming.headers = {
    "content-type": params.contentType ?? "application/x-www-form-urlencoded",
  };
  process.nextTick(() => {
    if (params.body) {
      req.write(params.body);
    }
    if (!params.keepOpen) {
      req.end();
    }
  });
  return incoming;
}

function createResponse(): {
  res: ServerResponse;
  getBody: () => string;
  getHeaders: () => Map<string, string>;
} {
  let body = "";
  const headers = new Map<string, string>();
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    end(chunk?: string | Buffer) {
      body = chunk ? String(chunk) : "";
    },
  } as unknown as ServerResponse;
  return {
    res,
    getBody: () => body,
    getHeaders: () => headers,
  };
}

const accountFixture: ResolvedMattermostAccount = {
  accountId: "default",
  enabled: true,
  botToken: "bot-token",
  baseUrl: "https://chat.example.com",
  botTokenSource: "config",
  baseUrlSource: "config",
  config: {},
};

function cmd(overrides: Partial<MattermostRegisteredCommand> = {}): MattermostRegisteredCommand {
  return {
    id: "cmd-1",
    trigger: "oc_status",
    teamId: "t1",
    token: "known-token",
    url: "https://chat.example.com/callback",
    managed: true,
    ...overrides,
  };
}

async function runSlashRequest(params: {
  registeredCommands: MattermostRegisteredCommand[];
  body: string;
  method?: string;
  bodyTimeoutMs?: number;
  keepOpen?: boolean;
}) {
  const handler = createSlashCommandHttpHandler({
    account: accountFixture,
    cfg: {} as RemoteClawConfig,
    runtime: {} as RuntimeEnv,
    registeredCommands: params.registeredCommands,
    bodyTimeoutMs: params.bodyTimeoutMs,
  });
  const req = createRequest({
    method: params.method,
    body: params.body,
    keepOpen: params.keepOpen,
  });
  const response = createResponse();
  await handler(req, response.res);
  return response;
}

describe("slash-http", () => {
  it("rejects non-POST methods", async () => {
    const response = await runSlashRequest({
      registeredCommands: [cmd()],
      method: "GET",
      body: "",
    });

    expect(response.res.statusCode).toBe(405);
    expect(response.getBody()).toBe("Method Not Allowed");
    expect(response.getHeaders().get("allow")).toBe("POST");
  });

  it("rejects malformed payloads", async () => {
    const response = await runSlashRequest({
      registeredCommands: [cmd()],
      body: "token=abc&command=%2Foc_status",
    });

    expect(response.res.statusCode).toBe(400);
    expect(response.getBody()).toContain("Invalid slash command payload");
  });

  it("fails closed when no commands are registered", async () => {
    const response = await runSlashRequest({
      registeredCommands: [],
      body: "token=tok1&team_id=t1&channel_id=c1&user_id=u1&command=%2Foc_status&text=",
    });

    expect(response.res.statusCode).toBe(401);
    expect(response.getBody()).toContain("Unauthorized: invalid command token.");
  });

  it("rejects unknown command tokens", async () => {
    const response = await runSlashRequest({
      registeredCommands: [cmd({ token: "known-token" })],
      body: "token=unknown&team_id=t1&channel_id=c1&user_id=u1&command=%2Foc_status&text=",
    });

    expect(response.res.statusCode).toBe(401);
    expect(response.getBody()).toContain("Unauthorized: invalid command token.");
  });

  it("rejects a token registered for a different command (per-command scoping)", async () => {
    const response = await runSlashRequest({
      registeredCommands: [
        cmd({ id: "a", trigger: "oc_a", token: "token-a" }),
        cmd({ id: "b", trigger: "oc_b", token: "token-b" }),
      ],
      body: "token=token-a&team_id=t1&channel_id=c1&user_id=u1&command=%2Foc_b&text=",
    });

    expect(response.res.statusCode).toBe(401);
    expect(response.getBody()).toContain("Unauthorized: invalid command token.");
  });

  it("returns 413 when the body exceeds the size limit", async () => {
    const response = await runSlashRequest({
      registeredCommands: [cmd()],
      body: `token=${"x".repeat(70 * 1024)}`,
    });

    expect(response.res.statusCode).toBe(413);
  });

  it("returns 408 when the body read times out", async () => {
    const response = await runSlashRequest({
      registeredCommands: [cmd()],
      body: "token=par",
      keepOpen: true,
      bodyTimeoutMs: 50,
    });

    expect(response.res.statusCode).toBe(408);
  });
});
