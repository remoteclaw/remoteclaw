import { describe, expect, it } from "vitest";
import type { MsgContext } from "../templating.js";
import { buildMentionRegexes, stripMentions, stripStructuralPrefixes } from "./mentions.js";

describe("stripStructuralPrefixes", () => {
  it("returns empty string for undefined input at runtime", () => {
    expect(stripStructuralPrefixes(undefined as unknown as string)).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(stripStructuralPrefixes("")).toBe("");
  });

  it("strips sender prefix labels", () => {
    expect(stripStructuralPrefixes("John: hello")).toBe("hello");
  });

  it("passes through plain text", () => {
    expect(stripStructuralPrefixes("just a message")).toBe("just a message");
  });
});

describe("mention-pattern ReDoS safety (#2927)", () => {
  it("buildMentionRegexes drops catastrophic-backtracking and invalid patterns, keeps safe ones", () => {
    const regexes = buildMentionRegexes({
      messages: { groupChat: { mentionPatterns: ["\\bbot\\b", "(a+)+$", "(invalid"] } },
    });
    expect(regexes).toHaveLength(1);
    expect(regexes[0]?.test("bot")).toBe(true);
  });

  it("stripMentions ignores an unsafe configured pattern instead of running it", () => {
    const stripped = stripMentions(`bot ${"a".repeat(30)}!`, {} as MsgContext, {
      messages: { groupChat: { mentionPatterns: ["\\bbot\\b", "(a+)+$"] } },
    });
    expect(stripped).toBe(`${"a".repeat(30)}!`);
  });
});
