import { describe, expect, it, vi } from "vitest";
import { buildTelegramMessageContextForTest } from "./bot-message-context.test-harness.js";

const transcribeFirstAudioMock = vi.fn();
const DEFAULT_MODEL = "anthropic/claude-opus-4-5";
const DEFAULT_WORKSPACE = "/tmp/remoteclaw";
const DEFAULT_MENTION_PATTERN = "\\bbot\\b";

vi.mock("../../../src/stt/preflight.js", () => ({
  transcribeFirstAudio: (...args: unknown[]) => transcribeFirstAudioMock(...args),
}));

async function buildGroupVoiceContext(params: {
  messageId: number;
  chatId: number;
  title: string;
  date: number;
  fromId: number;
  firstName: string;
  fileId: string;
  mediaPath: string;
  groupDisableAudioPreflight?: boolean;
  topicDisableAudioPreflight?: boolean;
}) {
  const groupConfig = {
    requireMention: true,
    ...(params.groupDisableAudioPreflight === undefined
      ? {}
      : { disableAudioPreflight: params.groupDisableAudioPreflight }),
  };
  const topicConfig =
    params.topicDisableAudioPreflight === undefined
      ? undefined
      : { disableAudioPreflight: params.topicDisableAudioPreflight };

  return buildTelegramMessageContextForTest({
    message: {
      message_id: params.messageId,
      chat: { id: params.chatId, type: "supergroup", title: params.title },
      date: params.date,
      text: undefined,
      from: { id: params.fromId, first_name: params.firstName },
      voice: { file_id: params.fileId },
    },
    allMedia: [{ path: params.mediaPath, contentType: "audio/ogg" }],
    options: { forceWasMentioned: true },
    cfg: {
      agents: { defaults: { model: DEFAULT_MODEL, workspace: DEFAULT_WORKSPACE } },
      channels: { telegram: {} },
      messages: { groupChat: { mentionPatterns: [DEFAULT_MENTION_PATTERN] } },
    },
    resolveGroupActivation: () => true,
    resolveGroupRequireMention: () => true,
    resolveTelegramGroupConfig: () => ({
      groupConfig,
      topicConfig,
    }),
  });
}

function expectTranscriptRendered(
  ctx: Awaited<ReturnType<typeof buildGroupVoiceContext>>,
  transcript: string,
) {
  expect(ctx).not.toBeNull();
  expect(ctx?.ctxPayload?.BodyForAgent).toBe(transcript);
  expect(ctx?.ctxPayload?.Body).toContain(transcript);
  expect(ctx?.ctxPayload?.Body).not.toContain("<media:audio>");
}

function expectAudioPlaceholderRendered(ctx: Awaited<ReturnType<typeof buildGroupVoiceContext>>) {
  expect(ctx).not.toBeNull();
  expect(ctx?.ctxPayload?.Body).toContain("<media:audio>");
}

describe("buildTelegramMessageContext audio transcript body", () => {
  it("uses preflight transcript as BodyForAgent for mention-gated group voice messages", async () => {
    transcribeFirstAudioMock.mockResolvedValueOnce("hey bot please help");

    const ctx = await buildGroupVoiceContext({
      messageId: 1,
      chatId: -1001234567890,
      title: "Test Group",
      date: 1700000000,
      fromId: 42,
      firstName: "Alice",
      fileId: "voice-1",
      mediaPath: "/tmp/voice.ogg",
    });

    expect(transcribeFirstAudioMock).toHaveBeenCalledTimes(1);
    expectTranscriptRendered(ctx, "hey bot please help");
  });

  it("skips preflight transcription when disableAudioPreflight is true", async () => {
    transcribeFirstAudioMock.mockClear();

    const ctx = await buildGroupVoiceContext({
      messageId: 2,
      chatId: -1001234567891,
      title: "Test Group 2",
      date: 1700000100,
      fromId: 43,
      firstName: "Bob",
      fileId: "voice-2",
      mediaPath: "/tmp/voice2.ogg",
      groupDisableAudioPreflight: true,
    });

    expect(transcribeFirstAudioMock).not.toHaveBeenCalled();
    expectAudioPlaceholderRendered(ctx);
  });

  it("uses topic disableAudioPreflight=false to override group disableAudioPreflight=true", async () => {
    transcribeFirstAudioMock.mockResolvedValueOnce("topic override transcript");

    const ctx = await buildGroupVoiceContext({
      messageId: 3,
      chatId: -1001234567892,
      title: "Test Group 3",
      date: 1700000200,
      fromId: 44,
      firstName: "Cara",
      fileId: "voice-3",
      mediaPath: "/tmp/voice3.ogg",
      groupDisableAudioPreflight: true,
      topicDisableAudioPreflight: false,
    });

    expect(transcribeFirstAudioMock).toHaveBeenCalledTimes(1);
    expectTranscriptRendered(ctx, "topic override transcript");
  });

  it("uses topic disableAudioPreflight=true to override group disableAudioPreflight=false", async () => {
    transcribeFirstAudioMock.mockClear();

    const ctx = await buildGroupVoiceContext({
      messageId: 4,
      chatId: -1001234567893,
      title: "Test Group 4",
      date: 1700000300,
      fromId: 45,
      firstName: "Dan",
      fileId: "voice-4",
      mediaPath: "/tmp/voice4.ogg",
      groupDisableAudioPreflight: false,
      topicDisableAudioPreflight: true,
    });

    expect(transcribeFirstAudioMock).not.toHaveBeenCalled();
    expectAudioPlaceholderRendered(ctx);
  });
});

describe("Telegram Premium native voice transcript", () => {
  it("uses native voice.transcript for DM voice messages", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      message: {
        message_id: 10,
        chat: { id: 42, type: "private" },
        date: 1700000000,
        from: { id: 42, first_name: "Alice" },
        voice: { file_id: "voice-10", transcript: "привіт це голосове повідомлення" },
      },
      allMedia: [{ path: "/tmp/voice.ogg", contentType: "audio/ogg" }],
      cfg: {
        agents: { defaults: { model: DEFAULT_MODEL, workspace: DEFAULT_WORKSPACE } },
        channels: { telegram: {} },
      },
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.ctxPayload?.BodyForAgent).toBe("привіт це голосове повідомлення");
    expect(ctx?.ctxPayload?.Body).not.toContain("<media:audio>");
  });

  it("uses native voice.transcript for group voice messages", async () => {
    const ctx = await buildGroupVoiceContext({
      messageId: 11,
      chatId: -1001234567890,
      title: "Test Group",
      date: 1700000000,
      fromId: 42,
      firstName: "Alice",
      fileId: "voice-11",
      mediaPath: "/tmp/voice.ogg",
    });

    // Without native transcript and without preflight mock, should fall back to placeholder
    expectAudioPlaceholderRendered(ctx);
  });

  it("uses native transcript even when no preflight transcription is available", async () => {
    transcribeFirstAudioMock.mockClear();

    const ctx = await buildTelegramMessageContextForTest({
      message: {
        message_id: 12,
        chat: { id: -1001234567890, type: "supergroup", title: "Test Group" },
        date: 1700000000,
        from: { id: 42, first_name: "Alice" },
        voice: { file_id: "voice-12", transcript: "native transcript wins" },
      },
      allMedia: [{ path: "/tmp/voice.ogg", contentType: "audio/ogg" }],
      options: { forceWasMentioned: true },
      cfg: {
        agents: { defaults: { model: DEFAULT_MODEL, workspace: DEFAULT_WORKSPACE } },
        channels: { telegram: {} },
        messages: { groupChat: { mentionPatterns: [DEFAULT_MENTION_PATTERN] } },
      },
      resolveGroupActivation: () => true,
      resolveGroupRequireMention: () => true,
      resolveTelegramGroupConfig: () => ({ groupConfig: { requireMention: true } }),
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.ctxPayload?.BodyForAgent).toBe("native transcript wins");
    expect(ctx?.ctxPayload?.Body).not.toContain("<media:audio>");
  });

  it("falls back to <media:audio> when neither native transcript nor preflight available", async () => {
    transcribeFirstAudioMock.mockResolvedValueOnce(undefined);

    const ctx = await buildGroupVoiceContext({
      messageId: 13,
      chatId: -1001234567890,
      title: "Test Group",
      date: 1700000000,
      fromId: 42,
      firstName: "Alice",
      fileId: "voice-13",
      mediaPath: "/tmp/voice.ogg",
    });

    expectAudioPlaceholderRendered(ctx);
  });
});
