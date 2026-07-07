import { describe, expect, it } from "vitest";
import { hasPollCreationParams } from "./poll-params.js";

describe("poll params", () => {
  it("does not treat explicit false booleans as poll creation params", () => {
    expect(
      hasPollCreationParams({
        pollMulti: false,
        pollAnonymous: false,
        pollPublic: false,
      }),
    ).toBe(false);
  });

  it.each([{ key: "pollMulti" }, { key: "pollAnonymous" }, { key: "pollPublic" }])(
    "treats $key=true as poll creation intent",
    ({ key }) => {
      expect(
        hasPollCreationParams({
          [key]: true,
        }),
      ).toBe(true);
    },
  );

  it("treats non-zero finite numeric poll params as poll creation intent", () => {
    // A zero-valued numeric param (e.g. pollDurationHours: 0) is an unset default,
    // not poll-creation intent — it must not turn a plain send into a poll (v5.7
    // semantics; consumed by message-action-runner's send-vs-poll classification).
    expect(hasPollCreationParams({ pollDurationHours: 0 })).toBe(false);
    expect(hasPollCreationParams({ pollDurationSeconds: 60 })).toBe(true);
    expect(hasPollCreationParams({ pollDurationSeconds: "60" })).toBe(true);
    expect(hasPollCreationParams({ pollDurationSeconds: "1e3" })).toBe(true);
    expect(hasPollCreationParams({ pollDurationHours: -1 })).toBe(true);
    expect(hasPollCreationParams({ pollDurationHours: Number.NaN })).toBe(false);
    expect(hasPollCreationParams({ pollDurationSeconds: Infinity })).toBe(false);
    expect(hasPollCreationParams({ pollDurationSeconds: "60abc" })).toBe(false);
  });

  it("treats string-encoded boolean poll params as poll creation intent when true", () => {
    expect(hasPollCreationParams({ pollPublic: "true" })).toBe(true);
    expect(hasPollCreationParams({ pollAnonymous: "false" })).toBe(false);
  });

  it("treats string poll options as poll creation intent", () => {
    expect(hasPollCreationParams({ pollOption: "Yes" })).toBe(true);
  });

  it("detects snake_case poll fields as poll creation intent", () => {
    expect(hasPollCreationParams({ poll_question: "Lunch?" })).toBe(true);
    expect(hasPollCreationParams({ poll_option: ["Pizza", "Sushi"] })).toBe(true);
    expect(hasPollCreationParams({ poll_duration_seconds: "60" })).toBe(true);
    expect(hasPollCreationParams({ poll_public: "true" })).toBe(true);
  });

  it("ignores poll vote params when deciding whether send should become poll", () => {
    expect(hasPollCreationParams({ pollId: "poll-1" })).toBe(false);
    expect(hasPollCreationParams({ pollOptionId: "answer-1" })).toBe(false);
    expect(hasPollCreationParams({ pollOptionIndexes: [1] })).toBe(false);
  });
});
