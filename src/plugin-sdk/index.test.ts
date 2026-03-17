import { describe, expect, it } from "vitest";
import * as sdk from "./index.js";

describe("plugin-sdk exports", () => {
  it("does not expose runtime modules", () => {
    const forbidden = [
      "chunkMarkdownText",
      "chunkText",
      "hasControlCommand",
      "isControlCommandMessage",
      "shouldComputeCommandAuthorized",
      "shouldHandleTextCommands",
      "buildMentionRegexes",
      "matchesMentionPatterns",
      "resolveStateDir",
      "writeConfigFile",
      "enqueueSystemEvent",
      "fetchRemoteMedia",
      "saveMediaBuffer",
      "formatAgentEnvelope",
      "buildPairingReply",
      "resolveAgentRoute",
      "dispatchReplyFromConfig",
      "createReplyDispatcherWithTyping",
      "dispatchReplyWithBufferedBlockDispatcher",
      "resolveCommandAuthorizedFromAuthorizers",
      "monitorSlackProvider",
      "monitorTelegramProvider",
      "monitorIMessageProvider",
      "monitorSignalProvider",
      "sendMessageSlack",
      "sendMessageTelegram",
      "sendMessageIMessage",
      "sendMessageSignal",
      "sendMessageWhatsApp",
      "probeSlack",
      "probeTelegram",
      "probeIMessage",
      "probeSignal",
    ];

    for (const key of forbidden) {
      expect(Object.prototype.hasOwnProperty.call(sdk, key)).toBe(false);
    }
  });

  it("keeps the root runtime surface intentionally small", () => {
    expect(typeof sdk.emptyPluginConfigSchema).toBe("function");
    expect(Object.prototype.hasOwnProperty.call(sdk, "resolveControlCommandGate")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(sdk, "buildAgentSessionKey")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(sdk, "isDangerousNameMatchingEnabled")).toBe(false);
  });
});
