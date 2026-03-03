import { describe, expect, it } from "vitest";
import { resolveIrcInboundTarget } from "./monitor.js";

describe("irc monitor inbound target", () => {
  it("keeps channel target for group messages", () => {
    expect(
      resolveIrcInboundTarget({
        target: "#remoteclaw",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: true,
      target: "#remoteclaw",
      rawTarget: "#remoteclaw",
    });
  });

  it("maps DM target to sender nick and preserves raw target", () => {
    expect(
      resolveIrcInboundTarget({
        target: "remoteclaw-bot",
        senderNick: "alice",
      }),
    ).toEqual({
      isGroup: false,
      target: "alice",
      rawTarget: "remoteclaw-bot",
    });
  });

  it("falls back to raw target when sender nick is empty", () => {
    expect(
      resolveIrcInboundTarget({
        target: "remoteclaw-bot",
        senderNick: " ",
      }),
    ).toEqual({
      isGroup: false,
      target: "remoteclaw-bot",
      rawTarget: "remoteclaw-bot",
    });
  });
});
