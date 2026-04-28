import { vi } from "vitest";
import type { MockFn } from "../../../../src/test-utils/vitest-mock-fn.js";

export const preflightDiscordMessageMock: MockFn = vi.fn();
export const processDiscordMessageMock: MockFn = vi.fn();
export const deliverDiscordReplyMock: MockFn = vi.fn(async () => undefined);

vi.mock("./message-handler.preflight.js", () => ({
  preflightDiscordMessage: preflightDiscordMessageMock,
}));

vi.mock("./message-handler.process.js", () => ({
  processDiscordMessage: processDiscordMessageMock,
}));

vi.mock("./reply-delivery.js", () => ({
  deliverDiscordReply: deliverDiscordReplyMock,
}));

export const { createDiscordMessageHandler } = await import("./message-handler.js");
