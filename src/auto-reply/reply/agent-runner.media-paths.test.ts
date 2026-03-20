import { describe, it } from "vitest";

describe("runReplyAgent media path normalization", () => {
  // The original upstream test relied on the Pi embedded agent
  // (../../agents/pi-embedded.js) which has been removed in this fork.
  // Media path normalization is covered directly by reply-media-paths.test.ts.
  it.todo("media path normalization integration (requires agent runtime)");
});
