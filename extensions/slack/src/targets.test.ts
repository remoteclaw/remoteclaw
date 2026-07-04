import { describe, expect, it } from "vitest";
import {
  normalizeSlackMessagingTarget,
  parseSlackTarget,
  resolveSlackChannelId,
} from "./targets.js";

describe("parseSlackTarget", () => {
  it("parses user mentions and prefixes", () => {
    const cases = [
      { input: "<@U123>", id: "U123", normalized: "user:u123" },
      { input: "user:U456", id: "U456", normalized: "user:u456" },
      { input: "slack:U789", id: "U789", normalized: "user:u789" },
    ] as const;
    for (const testCase of cases) {
      expect(parseSlackTarget(testCase.input), testCase.input).toMatchObject({
        kind: "user",
        id: testCase.id,
        normalized: testCase.normalized,
      });
    }
  });

  it("parses channel targets", () => {
    const cases = [
      { input: "channel:C123", id: "C123", normalized: "channel:c123" },
      { input: "#C999", id: "C999", normalized: "channel:c999" },
    ] as const;
    for (const testCase of cases) {
      expect(parseSlackTarget(testCase.input), testCase.input).toMatchObject({
        kind: "channel",
        id: testCase.id,
        normalized: testCase.normalized,
      });
    }
  });

  it("rejects invalid @ and # targets", () => {
    const cases = [
      { input: "@bob-1", expectedMessage: /Slack DMs require a user id/ },
      { input: "#general-1", expectedMessage: /Slack channels require a channel id/ },
    ] as const;
    for (const testCase of cases) {
      expect(() => parseSlackTarget(testCase.input), testCase.input).toThrow(
        testCase.expectedMessage,
      );
    }
  });

  it("rejects ids whose prefix contradicts the declared kind (#2087)", () => {
    const cases = [
      {
        input: "user:D0AKUMPAKMF",
        expectedMessage:
          'Slack ID "D0AKUMPAKMF" looks like a DM channel (D-prefix), but was specified as user:. Use channel:D0AKUMPAKMF instead.',
      },
      {
        input: "channel:U0AKUMPAKMF",
        expectedMessage:
          /looks like a user \(U-prefix\), but was specified as channel:\. Use user:U0AKUMPAKMF instead\./,
      },
      {
        input: "slack:C0PUBLIC00",
        expectedMessage:
          /looks like a public channel \(C-prefix\), but was specified as slack:\. Use channel:C0PUBLIC00 instead\./,
      },
      {
        input: "#U0AKUMPAKMF",
        expectedMessage:
          /looks like a user \(U-prefix\), but was specified as #\. Use user:U0AKUMPAKMF instead\./,
      },
    ] as const;
    for (const testCase of cases) {
      expect(() => parseSlackTarget(testCase.input), testCase.input).toThrow(
        testCase.expectedMessage,
      );
    }
  });

  it("accepts ids whose prefix matches the declared kind (#2087)", () => {
    const cases = [
      // The documented fix from the issue: a DM channel id belongs to `channel:`.
      { input: "channel:D0AKUMPAKMF", kind: "channel", id: "D0AKUMPAKMF" },
      { input: "user:W012ENTERPRISE", kind: "user", id: "W012ENTERPRISE" },
      { input: "user:B0BOTUSER00", kind: "user", id: "B0BOTUSER00" },
      { input: "channel:G0PRIVATE00", kind: "channel", id: "G0PRIVATE00" },
      { input: "#D0AKUMPAKMF", kind: "channel", id: "D0AKUMPAKMF" },
    ] as const;
    for (const testCase of cases) {
      expect(parseSlackTarget(testCase.input), testCase.input).toMatchObject({
        kind: testCase.kind,
        id: testCase.id,
      });
    }
  });
});

describe("resolveSlackChannelId", () => {
  it("strips channel: prefix and accepts raw ids", () => {
    expect(resolveSlackChannelId("channel:C123")).toBe("C123");
    expect(resolveSlackChannelId("C123")).toBe("C123");
  });

  it("rejects user targets", () => {
    expect(() => resolveSlackChannelId("user:U123")).toThrow(/channel id is required/i);
  });
});

describe("normalizeSlackMessagingTarget", () => {
  it("defaults raw ids to channels", () => {
    expect(normalizeSlackMessagingTarget("C123")).toBe("channel:c123");
  });
});
