import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../../src/config/config.js";

const hoisted = vi.hoisted(() => ({
  sendPollWhatsApp: vi.fn(async () => ({ messageId: "poll-1", toJid: "1555@s.whatsapp.net" })),
}));

vi.mock("../../../src/globals.js", () => ({
  shouldLogVerbose: () => false,
}));

vi.mock("./send.js", () => ({
  sendPollWhatsApp: hoisted.sendPollWhatsApp,
}));

let whatsappOutbound: typeof import("./outbound-adapter.js").whatsappOutbound;

describe("whatsappOutbound sendPoll", () => {
  beforeEach(async () => {
    vi.resetModules();
    ({ whatsappOutbound } = await import("./outbound-adapter.js"));
  });

  it("threads cfg through poll send options", async () => {
    const cfg = { marker: "resolved-cfg" } as RemoteClawConfig;
    const poll = {
      question: "Lunch?",
      options: ["Pizza", "Sushi"],
      maxSelections: 1,
    };

    const result = await whatsappOutbound.sendPoll!({
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
    expect(result).toEqual({ messageId: "poll-1", toJid: "1555@s.whatsapp.net" });
  });
});
