import { describe, expect, it } from "vitest";
import { type SystemPromptParams, buildSystemPrompt } from "./system-prompt.js";

function makeParams(overrides?: Partial<SystemPromptParams>): SystemPromptParams {
  return {
    channelName: "telegram",
    ...overrides,
  };
}

describe("buildSystemPrompt", () => {
  describe("section inclusion", () => {
    it("includes all required sections in output", () => {
      const result = buildSystemPrompt(makeParams({ userName: "Alice", timezone: "UTC" }));
      expect(result).toContain("## Messaging");
      expect(result).toContain("## Reply Tags");
      expect(result).toContain("## Silent Replies");
      expect(result).toContain("## Runtime");
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
  });

  describe("dynamic content", () => {
    it("runtime section includes user name when provided", () => {
      const result = buildSystemPrompt(makeParams({ userName: "Bob" }));
      expect(result).toContain("user=Bob");
    });

    it("runtime section omits user name when not provided", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).not.toContain("user=");
    });

    it("runtime section includes timezone when provided", () => {
      const result = buildSystemPrompt(makeParams({ timezone: "America/New_York" }));
      expect(result).toContain("timezone=America/New_York");
    });

    it("runtime section omits timezone when not provided", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).not.toContain("timezone=");
      expect(result).toContain("channel=telegram");
    });

    it("runtime section does not include agent ID", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).not.toContain("agent=");
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
  });

  describe("size budget", () => {
    it("base prompt (no hints, no optional sections) is under 4,000 chars", () => {
      const result = buildSystemPrompt(makeParams({ userName: "Alice", timezone: "UTC" }));
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
          messageToolHints: lineHints,
        }),
      );
      expect(result.length).toBeLessThan(6000);
    });
  });

  describe("content correctness", () => {
    it("reply tags section contains [[reply_to_current]] syntax", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).toContain("[[reply_to_current]]");
    });

    it("messaging section documents [System Message] marker protocol", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).toContain("[System Message]");
      expect(result).toContain("do not forward them to users");
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
          messageToolHints: ["some hint"],
        }),
      );
      expect(result).not.toContain("OpenClaw");
      expect(result).not.toContain("remoteclaw");
      expect(result).not.toContain("pi-embedded");
      expect(result).not.toContain("SOUL.md");
    });

    it("sections are separated by double newlines", () => {
      const result = buildSystemPrompt(makeParams());
      expect(result).toMatch(/^## Messaging/);
      expect(result).toContain("\n\n## Reply Tags");
      expect(result).toContain("\n\n## Silent Replies");
      expect(result).toContain("\n\n## Runtime");
    });
  });
});
