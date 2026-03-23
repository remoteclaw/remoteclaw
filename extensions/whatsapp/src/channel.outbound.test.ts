import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWhatsAppPollFixture,
  expectWhatsAppPollSent,
} from "../../../src/test-helpers/whatsapp-outbound.js";

const hoisted = vi.hoisted(() => ({
  sendPollWhatsApp: vi.fn(async () => ({ messageId: "wa-poll-1", toJid: "1555@s.whatsapp.net" })),
}));

vi.mock("./runtime.js", () => ({
  getWhatsAppRuntime: () => ({
    logging: {
      shouldLogVerbose: () => false,
    },
    channel: {
      whatsapp: {
        sendPollWhatsApp: hoisted.sendPollWhatsApp,
      },
    },
  }),
}));

let whatsappPlugin: typeof import("./channel.js").whatsappPlugin;

describe("whatsappPlugin outbound sendPoll", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ whatsappPlugin } = await import("./channel.js"));
  });

  it("threads cfg into runtime sendPollWhatsApp call", async () => {
    const cfg = { marker: "resolved-cfg" } as RemoteClawConfig;
    const poll = {
      question: "Lunch?",
      options: ["Pizza", "Sushi"],
      maxSelections: 1,
    };

    const result = await whatsappPlugin.outbound!.sendPoll!({
      cfg,
      to: "+1555",
      poll,
      accountId: "work",
    });

    expect(hoisted.sendPollWhatsApp).toHaveBeenCalledWith("+1555", poll, {
      verbose: false,
      accountId: "work",
      cfg,
    });
    expect(result).toEqual({
      channel: "whatsapp",
      messageId: "wa-poll-1",
      toJid: "1555@s.whatsapp.net",
    });
  });
});
