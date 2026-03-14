import type { Mock } from "vitest";
import { vi } from "vitest";
import type { MockFn } from "../../../../src/test-utils/vitest-mock-fn.js";

export const preflightDiscordMessageMock: Mock = vi.fn();
export const processDiscordMessageMock: Mock = vi.fn();

vi.mock("./message-handler.preflight.js", () => ({
  preflightDiscordMessage: preflightDiscordMessageMock,
}));

vi.mock("./message-handler.process.js", () => ({
  processDiscordMessage: processDiscordMessageMock,
}));

export const { createDiscordMessageHandler } = await import("./message-handler.js");
