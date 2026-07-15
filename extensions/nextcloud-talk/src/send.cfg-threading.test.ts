import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSendCfgThreadingRuntime,
  expectProvidedCfgSkipsRuntimeLoad,
  expectRuntimeCfgFallback,
} from "../../../test/helpers/plugins/send-config.js";

const hoisted = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  resolveMarkdownTableMode: vi.fn(() => "preserve"),
  convertMarkdownTables: vi.fn((text: string) => text),
  record: vi.fn(),
  resolveNextcloudTalkAccount: vi.fn(),
  generateNextcloudTalkSignature: vi.fn(() => ({
    random: "r",
    signature: "s",
  })),
}));

// The fork's send.ts imports helpers directly from the real modules (there is no
// `./send.runtime.js` barrel), reads config/markdown/activity off the runtime
// object, and calls the global `fetch` directly.
vi.mock("./runtime.js", () => ({
  getNextcloudTalkRuntime: () => createSendCfgThreadingRuntime(hoisted),
}));

vi.mock("./accounts.js", () => ({
  resolveNextcloudTalkAccount: hoisted.resolveNextcloudTalkAccount,
}));

vi.mock("./signature.js", () => ({
  generateNextcloudTalkSignature: hoisted.generateNextcloudTalkSignature,
}));

const { sendMessageNextcloudTalk, sendReactionNextcloudTalk } = await import("./send.js");

function expectProvidedMessageCfgThreading(cfg: unknown): void {
  expectProvidedCfgSkipsRuntimeLoad({
    loadConfig: hoisted.loadConfig,
    resolveAccount: hoisted.resolveNextcloudTalkAccount,
    cfg,
    accountId: "work",
  });
  expect(hoisted.resolveMarkdownTableMode).toHaveBeenCalledWith({
    cfg,
    channel: "nextcloud-talk",
    accountId: "default",
  });
  expect(hoisted.convertMarkdownTables).toHaveBeenCalledWith("hello", "preserve");
}

describe("nextcloud-talk send cfg threading", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const defaultAccount = {
    accountId: "default",
    baseUrl: "https://nextcloud.example.com",
    secret: "secret-value",
  };

  function mockNextcloudMessageResponse(messageId: number, timestamp: number): void {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ocs: { data: { id: messageId, timestamp } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    hoisted.loadConfig.mockReset();
    hoisted.resolveMarkdownTableMode.mockClear();
    hoisted.convertMarkdownTables.mockClear();
    hoisted.record.mockReset();
    hoisted.generateNextcloudTalkSignature.mockClear();
    hoisted.resolveNextcloudTalkAccount.mockReset();
    hoisted.resolveNextcloudTalkAccount.mockReturnValue(defaultAccount);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("uses provided cfg for sendMessage and skips runtime loadConfig", async () => {
    const cfg = { source: "provided" } as const;
    mockNextcloudMessageResponse(12345, 1_706_000_000);

    const result = await sendMessageNextcloudTalk("room:abc123", "hello", {
      cfg,
      accountId: "work",
    });

    expectProvidedMessageCfgThreading(cfg);
    expect(hoisted.record).toHaveBeenCalledWith({
      channel: "nextcloud-talk",
      accountId: "default",
      direction: "outbound",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      messageId: "12345",
      roomToken: "abc123",
      timestamp: 1_706_000_000,
    });
  });

  it("sends with provided cfg even when the runtime store is not initialized", async () => {
    const cfg = { source: "provided" } as const;
    hoisted.record.mockImplementation(() => {
      throw new Error("Nextcloud Talk runtime not initialized");
    });
    mockNextcloudMessageResponse(12346, 1_706_000_001);

    const result = await sendMessageNextcloudTalk("room:abc123", "hello", {
      cfg,
      accountId: "work",
    });

    expectProvidedMessageCfgThreading(cfg);
    expect(result).toEqual({
      messageId: "12346",
      roomToken: "abc123",
      timestamp: 1_706_000_001,
    });
  });

  it("falls back to runtime cfg for sendReaction when cfg is omitted", async () => {
    const runtimeCfg = { source: "runtime" } as const;
    hoisted.loadConfig.mockReturnValueOnce(runtimeCfg);
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const result = await sendReactionNextcloudTalk("room:ops", "m-1", "👍", {
      accountId: "default",
    });

    expect(result).toEqual({ ok: true });
    expectRuntimeCfgFallback({
      loadConfig: hoisted.loadConfig,
      resolveAccount: hoisted.resolveNextcloudTalkAccount,
      cfg: runtimeCfg,
      accountId: "default",
    });
  });

  it("uses provided cfg for sendReaction and posts the reaction payload", async () => {
    const cfg = { source: "provided" } as const;
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const result = await sendReactionNextcloudTalk("room:ops", "m-1", "👍", {
      cfg,
      accountId: "work",
    });

    expectProvidedCfgSkipsRuntimeLoad({
      loadConfig: hoisted.loadConfig,
      resolveAccount: hoisted.resolveNextcloudTalkAccount,
      cfg,
      accountId: "work",
    });
    expect(hoisted.generateNextcloudTalkSignature).toHaveBeenCalledWith({
      body: "👍",
      secret: "secret-value",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://nextcloud.example.com/ocs/v2.php/apps/spreed/api/v1/bot/ops/reaction/m-1",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "OCS-APIRequest": "true",
          "X-Nextcloud-Talk-Bot-Random": "r",
          "X-Nextcloud-Talk-Bot-Signature": "s",
        },
        body: JSON.stringify({ reaction: "👍" }),
      },
    );
    expect(result).toEqual({ ok: true });
  });

  it("surfaces sendReaction HTTP failures", async () => {
    fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));

    await expect(
      sendReactionNextcloudTalk("room:ops", "m-1", "👍", {
        cfg: { source: "provided" },
        accountId: "work",
      }),
    ).rejects.toThrow("Nextcloud Talk reaction failed: 403 forbidden");
  });
});
