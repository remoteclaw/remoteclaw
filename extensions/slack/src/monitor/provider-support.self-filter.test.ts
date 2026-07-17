import { describe, expect, it } from "vitest";
import { shouldSkipRemoteClawSlackSelfEvent } from "./provider-support.js";

// `shouldSkipRemoteClawSlackSelfEvent` decides whether to drop a self-attributed Slack
// event. It is deliberately scoped rather than a blanket self-drop: swallowing every
// self-attributed event would also swallow the assistant DM `message_changed` edits that
// carry a real human sender in `metadata.event_payload.user`, so it skips genuine bot
// noise but keeps the message_changed passthrough. These cases pin that scoping.
const CONTEXT = { botUserId: "U_BOT", botId: "B_BOT" };

describe("shouldSkipRemoteClawSlackSelfEvent", () => {
  it("skips self-authored reaction_added events", () => {
    expect(
      shouldSkipRemoteClawSlackSelfEvent({
        context: CONTEXT,
        event: { type: "reaction_added", user: "U_BOT" },
      }),
    ).toBe(true);
  });

  it("keeps self-authored message_changed events (assistant DM edit passthrough)", () => {
    expect(
      shouldSkipRemoteClawSlackSelfEvent({
        context: CONTEXT,
        event: { type: "message", subtype: "message_changed", user: "U_BOT" },
      }),
    ).toBe(false);
  });

  it("skips self-authored plain message events", () => {
    expect(
      shouldSkipRemoteClawSlackSelfEvent({
        context: CONTEXT,
        event: { type: "message", user: "U_BOT" },
      }),
    ).toBe(true);
  });

  it("skips bot_message events authored by our own bot_id", () => {
    expect(
      shouldSkipRemoteClawSlackSelfEvent({
        context: CONTEXT,
        event: { type: "message", user: "U_OTHER" },
        message: { subtype: "bot_message", bot_id: "B_BOT" },
      }),
    ).toBe(true);
  });
});
