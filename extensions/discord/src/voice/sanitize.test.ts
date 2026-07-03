import { describe, expect, it } from "vitest";
import { sanitizeVoiceReplyTextForSpeech } from "./sanitize.js";

describe("sanitizeVoiceReplyTextForSpeech", () => {
  it("strips reply tags before speech", () => {
    expect(sanitizeVoiceReplyTextForSpeech("[[rc:reply]] hello there")).toBe("hello there");
  });

  it("strips the current speaker label prefix before speech", () => {
    expect(sanitizeVoiceReplyTextForSpeech("speaker-1: hello there", "speaker-1")).toBe(
      "hello there",
    );
  });

  it("keeps other prefixes intact", () => {
    expect(sanitizeVoiceReplyTextForSpeech("speaker-2: hello there", "speaker-1")).toBe(
      "speaker-2: hello there",
    );
  });

  it("handles reply tags and speaker prefixes together", () => {
    expect(
      sanitizeVoiceReplyTextForSpeech("[[rc:reply]] speaker-1: hello there", "speaker-1"),
    ).toBe("hello there");
  });

  it("strips decorative emoji before speech", () => {
    expect(sanitizeVoiceReplyTextForSpeech("😀 hello there 🎉", "speaker-1")).toBe("hello there");
  });

  it("keeps punctuation sane after emoji stripping", () => {
    expect(sanitizeVoiceReplyTextForSpeech("✅ done!", "speaker-1")).toBe("done!");
  });
});
