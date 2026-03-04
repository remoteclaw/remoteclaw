import { describe, expect, it } from "vitest";
import { type SystemPromptParams, buildSystemPrompt } from "./system-prompt.js";

function makeParams(overrides?: Partial<SystemPromptParams>): SystemPromptParams {
  return {
    channelName: "telegram",
    workspaceDir: "/home/user/workspace",
    ...overrides,
  };
}

describe("buildSystemPrompt", () => {
  describe("section inclusion", () => {
    it("includes all required sections in output", () => {
      const result = buildSystemPrompt(
        makeParams({ userName: "Alice", timezone: "UTC", agentId: "agent-1" }),
      );
      expect(result).toContain("RemoteClaw");
      expect(result).toContain("## Safety");
      expect(result).toContain("## Messaging");
      expect(result).toContain("## Reply Tags");
      expect(result).toContain("## Silent Replies");
      expect(result).toContain("## Runtime");
      expect(result).toContain("## Workspace");
    });

    it("includes messageToolHints section when hints are provided", () => {
      const result = buildSystemPrompt(
        makeParams({
          messageToolHints: ["Use rich text formatting for LINE messages."],
        }),
      );
      expect(result).toContain("## Message Formatting");
      expect(result).toContain("Use rich text formatting for LINE messages.");
    });

    it("includes authorized senders section when senders are provided", () => {
      const result = buildSystemPrompt(
        makeParams({
          authorizedSenders: ["+15551234567", "+15559876543"],
        }),
      );
      expect(result).toContain("## Authorized Senders");
      expect(result).toContain("+15551234567");
      expect(result).toContain("+15559876543");
    });

    it("includes reactions section when reactionGuidance is provided", () => {
      const result = buildSystemPrompt(
        makeParams({
          reactionGuidance: { level: "minimal", channel: "telegram" },
        }),
      );
      expect(result).toContain("## Reactions");
    });
  });

  describe("dynamic content", () => {
    it("identity section includes channel name and user name", () => {
      const result = buildSystemPrompt(makeParams({ channelName: "discord", userName: "Bob" }));
      expect(result).toContain("Bob");
      expect(result).toContain("discord");
    });

    it("identity section handles missing user name gracefully", () => {
      const result = buildSystemPrompt(makeParams({ channelName: "whatsapp" }));
      expect(result).toContain("responding to a message on whatsapp");
      expect(result).not.toContain("undefined");
    });

    it("runtime section includes timezone and agent ID", () => {
      const result = buildSystemPrompt(
        makeParams({
          timezone: "America/New_York",
          agentId: "agent-42",
        }),
      );
      expect(result).toContain("timezone=America/New_York");
      expect(result).toContain("agent=agent-42");
    });

    it("runtime section omits timezone and agent ID when not provided", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).not.toContain("timezone=");
      expect(result).not.toContain("agent=");
      expect(result).toContain("channel=telegram");
    });

    it("workspace section includes working directory path", () => {
      const result = buildSystemPrompt(makeParams({ workspaceDir: "/opt/my-project" }));
      expect(result).toContain("/opt/my-project");
    });

    it("authorized senders lists all provided sender IDs", () => {
      const result = buildSystemPrompt(
        makeParams({
          authorizedSenders: ["user1", "user2", "user3"],
        }),
      );
      expect(result).toContain("user1, user2, user3");
    });

    it("reactions section uses minimal guidance when level is minimal", () => {
      const result = buildSystemPrompt(
        makeParams({
          reactionGuidance: { level: "minimal", channel: "telegram" },
        }),
      );
      expect(result).toContain("MINIMAL mode");
      expect(result).toContain("React ONLY when truly relevant");
    });

    it("reactions section uses extensive guidance when level is extensive", () => {
      const result = buildSystemPrompt(
        makeParams({
          reactionGuidance: { level: "extensive", channel: "discord" },
        }),
      );
      expect(result).toContain("EXTENSIVE mode");
      expect(result).toContain("Feel free to react liberally");
    });
  });

  describe("conditional omission", () => {
    it("omits messageToolHints section when messageToolHints is undefined", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).not.toContain("## Message Formatting");
    });

    it("omits messageToolHints section when messageToolHints is empty", () => {
      const result = buildSystemPrompt(makeParams({ messageToolHints: [] }));
      expect(result).not.toContain("## Message Formatting");
    });

    it("omits authorized senders section when authorizedSenders is undefined", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).not.toContain("## Authorized Senders");
    });

    it("omits authorized senders section when authorizedSenders is empty", () => {
      const result = buildSystemPrompt(makeParams({ authorizedSenders: [] }));
      expect(result).not.toContain("## Authorized Senders");
    });

    it("omits authorized senders section when all senders are empty strings", () => {
      const result = buildSystemPrompt(makeParams({ authorizedSenders: ["", ""] }));
      expect(result).not.toContain("## Authorized Senders");
    });

    it("omits reactions section when reactionGuidance is undefined", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).not.toContain("## Reactions");
    });
  });

  describe("size budget", () => {
    it("base prompt (no hints, no optional sections) is under 4,000 chars", () => {
      const result = buildSystemPrompt(
        makeParams({ userName: "Alice", timezone: "UTC", agentId: "agent-1" }),
      );
      expect(result.length).toBeLessThan(4000);
    });

    it("full prompt with LINE hints (worst case) is under 6,000 chars", () => {
      const lineHints = Array.from(
        { length: 9 },
        (_, i) => `LINE directive ${i + 1}: ${"x".repeat(200)}`,
      );
      const result = buildSystemPrompt(
        makeParams({
          userName: "Alice",
          timezone: "Asia/Tokyo",
          agentId: "agent-1",
          authorizedSenders: ["+15551234567", "+15559876543"],
          messageToolHints: lineHints,
          reactionGuidance: { level: "extensive", channel: "line" },
        }),
      );
      expect(result.length).toBeLessThan(6000);
    });
  });

  describe("content correctness", () => {
    it("safety section is always present and contains safety keywords", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).toContain("## Safety");
      expect(result).toContain("safety");
      expect(result).toContain("privacy");
    });

    it("reply tags section contains [[reply_to_current]] syntax", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).toContain("[[reply_to_current]]");
    });

    it("silent replies section contains NO_REPLY token", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).toContain("NO_REPLY");
    });

    it("contains no OpenClaw-specific references", () => {
      const result = buildSystemPrompt(
        makeParams({
          userName: "Alice",
          timezone: "UTC",
          agentId: "agent-1",
          authorizedSenders: ["+15551234567"],
          messageToolHints: ["some hint"],
          reactionGuidance: { level: "minimal", channel: "telegram" },
        }),
      );
      expect(result).not.toContain("OpenClaw");
      expect(result).not.toContain("remoteclaw");
      expect(result).not.toContain("pi-embedded");
      expect(result).not.toContain("SOUL.md");
    });

    it("sections are separated by double newlines", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).toContain("\n\n## Safety");
      expect(result).toContain("\n\n## Messaging");
      expect(result).toContain("\n\n## Reply Tags");
      expect(result).toContain("\n\n## Silent Replies");
      expect(result).toContain("\n\n## Runtime");
      expect(result).toContain("\n\n## Workspace");
    });
  });
});
