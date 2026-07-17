import { beforeEach, describe, expect, it, vi } from "vitest";
import { logVerbose } from "../../../src/globals.js";
import { createSlackSendTestClient, installSlackBlockTestMocks } from "./blocks.test-helpers.js";

// send.ts imports logVerbose from src/globals.js directly, so mock that module rather
// than the plugin-sdk/runtime-env barrel that merely re-exports it.
vi.mock("../../../src/globals.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/globals.js")>()),
  logVerbose: vi.fn(),
}));

installSlackBlockTestMocks();
const { sendMessageSlack } = await import("./send.js");
const SLACK_TEST_CFG = { channels: { slack: { botToken: "xoxb-test" } } };

type SlackMissingScopeError = Error & {
  data?: {
    error?: string;
    needed?: string;
    response_metadata?: { scopes?: string[]; acceptedScopes?: string[] };
  };
};

function buildMissingScopeError(overrides?: {
  needed?: string;
  scopes?: string[];
  acceptedScopes?: string[];
}): SlackMissingScopeError {
  const err = new Error("An API error occurred: missing_scope") as SlackMissingScopeError;
  const response_metadata =
    overrides?.scopes || overrides?.acceptedScopes
      ? {
          ...(overrides?.scopes ? { scopes: overrides.scopes } : {}),
          ...(overrides?.acceptedScopes ? { acceptedScopes: overrides.acceptedScopes } : {}),
        }
      : undefined;
  err.data = {
    error: "missing_scope",
    ...(overrides?.needed != null ? { needed: overrides.needed } : {}),
    ...(response_metadata ? { response_metadata } : {}),
  };
  return err;
}

function readPostMessagePayload(
  client: ReturnType<typeof createSlackSendTestClient>,
  index: number,
): Record<string, unknown> {
  const call = vi.mocked(client.chat.postMessage).mock.calls[index];
  if (!call) {
    throw new Error(`expected Slack postMessage call #${index + 1}`);
  }
  const [payload] = call;
  if (!payload || typeof payload !== "object") {
    throw new Error(`expected Slack postMessage payload #${index + 1}`);
  }
  return payload as Record<string, unknown>;
}

describe("sendMessageSlack customize-scope fallback", () => {
  beforeEach(() => {
    vi.mocked(logVerbose).mockClear();
  });

  it("retries without identity when needed contains chat:write.customize", async () => {
    const client = createSlackSendTestClient();
    vi.mocked(client.chat.postMessage)
      .mockRejectedValueOnce(buildMissingScopeError({ needed: "chat:write.customize" }))
      .mockResolvedValueOnce({ ts: "171234.567" });

    const result = await sendMessageSlack("channel:C123", "hello", {
      token: "xoxb-test",
      cfg: SLACK_TEST_CFG,
      client,
      identity: { username: "Bot", iconUrl: "https://example.com/bot.png" },
    });

    expect(client.chat.postMessage).toHaveBeenCalledTimes(2);
    const firstCall = readPostMessagePayload(client, 0);
    const secondCall = readPostMessagePayload(client, 1);
    expect(firstCall).toEqual({
      channel: "C123",
      text: "hello",
      username: "Bot",
      icon_url: "https://example.com/bot.png",
      unfurl_links: false,
    });
    expect(secondCall).toEqual({
      channel: "C123",
      text: "hello",
      unfurl_links: false,
    });
    expect(vi.mocked(logVerbose)).toHaveBeenCalledWith(
      "slack send: missing chat:write.customize, retrying without custom identity",
    );
    expect(result.messageId).toBe("171234.567");
  });

  it("retries when chat:write.customize appears only in response_metadata.acceptedScopes", async () => {
    const client = createSlackSendTestClient();
    vi.mocked(client.chat.postMessage)
      .mockRejectedValueOnce(
        buildMissingScopeError({ acceptedScopes: ["chat:write", "chat:write.customize"] }),
      )
      .mockResolvedValueOnce({ ts: "171234.567" });

    await sendMessageSlack("channel:C123", "hello", {
      token: "xoxb-test",
      cfg: SLACK_TEST_CFG,
      client,
      identity: { iconEmoji: ":robot_face:" },
    });

    expect(client.chat.postMessage).toHaveBeenCalledTimes(2);
    const secondCall = readPostMessagePayload(client, 1);
    expect(secondCall).not.toHaveProperty("icon_emoji");
    expect(vi.mocked(logVerbose)).toHaveBeenCalledWith(
      "slack send: missing chat:write.customize, retrying without custom identity",
    );
  });

  it("retries when chat:write.customize appears only in response_metadata.scopes", async () => {
    const client = createSlackSendTestClient();
    vi.mocked(client.chat.postMessage)
      .mockRejectedValueOnce(buildMissingScopeError({ scopes: ["chat:write.customize"] }))
      .mockResolvedValueOnce({ ts: "171234.567" });

    await sendMessageSlack("channel:C123", "hello", {
      token: "xoxb-test",
      cfg: SLACK_TEST_CFG,
      client,
      identity: { username: "Bot" },
    });

    expect(client.chat.postMessage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(logVerbose)).toHaveBeenCalledWith(
      "slack send: missing chat:write.customize, retrying without custom identity",
    );
  });

  it("rethrows missing_scope errors that reference a different scope", async () => {
    const client = createSlackSendTestClient();
    const err = buildMissingScopeError({ needed: "channels:history" });
    vi.mocked(client.chat.postMessage).mockRejectedValueOnce(err);

    await expect(
      sendMessageSlack("channel:C123", "hello", {
        token: "xoxb-test",
        cfg: SLACK_TEST_CFG,
        client,
        identity: { username: "Bot" },
      }),
    ).rejects.toThrow("An API error occurred: missing_scope (needed: channels:history)");

    expect(client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logVerbose)).not.toHaveBeenCalled();
  });

  it("rethrows customize-scope errors when identity is empty", async () => {
    const client = createSlackSendTestClient();
    const err = buildMissingScopeError({ needed: "chat:write.customize" });
    vi.mocked(client.chat.postMessage).mockRejectedValueOnce(err);

    await expect(
      sendMessageSlack("channel:C123", "hello", {
        token: "xoxb-test",
        cfg: SLACK_TEST_CFG,
        client,
      }),
    ).rejects.toThrow("An API error occurred: missing_scope (needed: chat:write.customize)");

    expect(client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logVerbose)).not.toHaveBeenCalled();
  });

  it("preserves Slack missing-scope details for delivery queue recovery", async () => {
    const client = createSlackSendTestClient();
    vi.mocked(client.chat.postMessage).mockRejectedValueOnce(
      buildMissingScopeError({
        needed: "im:write",
        scopes: ["chat:write", "users:read"],
        acceptedScopes: ["im:write", "mpim:write"],
      }),
    );

    await expect(
      sendMessageSlack("channel:C123", "hello", {
        token: "xoxb-test",
        cfg: SLACK_TEST_CFG,
        client,
      }),
    ).rejects.toThrow(
      "An API error occurred: missing_scope (needed: im:write; granted: chat:write, users:read; accepted: im:write, mpim:write)",
    );
  });

  // The assertions above use rejects.toThrow(string), which matches on substring and so
  // would pass even if the detail were appended twice. The send path enriches at each
  // throw site and again at the queued catch-all, so pin the exact message.
  it("appends the scope detail exactly once across nested throw sites", async () => {
    const client = createSlackSendTestClient();
    vi.mocked(client.chat.postMessage).mockRejectedValueOnce(
      buildMissingScopeError({ needed: "im:write", scopes: ["chat:write"] }),
    );

    const err = await sendMessageSlack("channel:C123", "hello", {
      token: "xoxb-test",
      cfg: SLACK_TEST_CFG,
      client,
    }).then(
      () => undefined,
      (reason: unknown) => reason as Error,
    );

    expect(err?.message).toBe(
      "An API error occurred: missing_scope (needed: im:write; granted: chat:write)",
    );
  });

  it("opts back into link unfurling when unfurlLinks is true", async () => {
    const client = createSlackSendTestClient();

    await sendMessageSlack("channel:C123", "https://example.com", {
      token: "xoxb-test",
      cfg: SLACK_TEST_CFG,
      client,
      unfurlLinks: true,
    });

    expect(readPostMessagePayload(client, 0)).toEqual({
      channel: "C123",
      text: "https://example.com",
      unfurl_links: true,
    });
  });

  it("preserves Slack missing-scope details while opening DMs", async () => {
    const client = createSlackSendTestClient();
    vi.mocked(client.conversations.open).mockRejectedValueOnce(
      buildMissingScopeError({
        needed: "im:write",
        scopes: ["chat:write"],
      }),
    );

    await expect(
      sendMessageSlack("user:U123", "hello", {
        token: "xoxb-test",
        cfg: SLACK_TEST_CFG,
        client,
        threadTs: "171234.100",
      }),
    ).rejects.toThrow(
      "An API error occurred: missing_scope (needed: im:write; granted: chat:write)",
    );
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });
});
