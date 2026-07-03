import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../middleware/system-prompt.js";
import {
  parseInlineDirectives,
  stripInlineDirectiveTagsForDelivery,
  stripInlineDirectiveTagsForDisplay,
} from "./directive-tags.js";

/**
 * Cross-file emit↔parse contract for the reply directive.
 *
 * `src/middleware/system-prompt.ts` tells the model which reply tag to EMIT;
 * `src/utils/directive-tags.ts` PARSES and STRIPS it. These two vocabularies
 * must never drift: when upstream sync #2634 reverted PR #2210's `rc:reply`
 * rename in the parser (but not in the system prompt), the advertised
 * `[[rc:reply]]` tag was neither parsed (no threading) nor stripped (leaked
 * literally into delivered messages) — issue #2775 — while every same-file
 * parser test stayed green because they were reverted in lockstep.
 *
 * This suite reads the tags the system prompt actually advertises and asserts
 * the parser handles each one, so a future re-drift fails here immediately.
 */
describe("reply directive emit↔parse contract (system-prompt ↔ directive-tags)", () => {
  const prompt = buildSystemPrompt({ channelName: "contract-test" });

  // The only double-bracket markers the default prompt emits are reply-directive
  // tags (the sole other marker, `[System Message]`, is single-bracket).
  const advertisedTags = prompt.match(/\[\[[^\]]*\]\]/g) ?? [];

  it("advertises reply tags (guards against a vacuous per-tag loop)", () => {
    // Degenerate-subject guard: if extraction found nothing, the loop below
    // would pass vacuously. Require a non-empty, correctly-shaped corpus.
    expect(advertisedTags.length).toBeGreaterThanOrEqual(3);
    expect(advertisedTags.some((tag) => /\[\[\s*rc:reply\s*\]\]/i.test(tag))).toBe(true);
    expect(advertisedTags.some((tag) => /\[\[\s*rc:reply\s*:/i.test(tag))).toBe(true);
  });

  it("recognizes and strips every advertised reply tag variant", () => {
    for (const tag of advertisedTags) {
      const parsed = parseInlineDirectives(`${tag} hello`, { currentMessageId: "msg-1" });
      expect(parsed.hasReplyTag, `parser must recognize advertised tag: ${tag}`).toBe(true);
      expect(parsed.text, `advertised tag must be stripped from parsed text: ${tag}`).not.toContain(
        "[[",
      );
      expect(parsed.text).toBe("hello");

      expect(
        stripInlineDirectiveTagsForDisplay(tag).text.includes("[["),
        `display strip must remove advertised tag: ${tag}`,
      ).toBe(false);
      expect(
        stripInlineDirectiveTagsForDelivery(`${tag} hello`).text,
        `delivery strip must remove advertised tag: ${tag}`,
      ).toBe("hello");
    }
  });

  it("threads [[rc:reply]] to the triggering message and delivers only the prose (issue #2775)", () => {
    const agentOutput = "[[rc:reply]] Yes, I exist. Here and ready.";
    const parsed = parseInlineDirectives(agentOutput, { currentMessageId: "trigger-42" });

    expect(parsed.hasReplyTag).toBe(true);
    expect(parsed.replyToCurrent).toBe(true);
    expect(parsed.replyToId).toBe("trigger-42");
    expect(parsed.text).toBe("Yes, I exist. Here and ready.");

    // The delivery strip is what channels apply before sending — no literal leak.
    expect(stripInlineDirectiveTagsForDelivery(agentOutput).text).toBe(
      "Yes, I exist. Here and ready.",
    );
  });

  it("threads [[rc:reply:<id>]] to the explicitly provided id", () => {
    const parsed = parseInlineDirectives("[[rc:reply:abc-123]] on it", {
      currentMessageId: "trigger-42",
    });

    expect(parsed.hasReplyTag).toBe(true);
    expect(parsed.replyToExplicitId).toBe("abc-123");
    expect(parsed.replyToId).toBe("abc-123");
    expect(parsed.text).toBe("on it");
  });
});
