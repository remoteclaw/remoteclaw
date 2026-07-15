import { describe, expect, it } from "vitest";
import { formatThreadBindingDurationLabel } from "./thread-bindings.messages.js";

describe("formatThreadBindingDurationLabel (#2932)", () => {
  it("formats a millisecond duration as a compact label", () => {
    expect(formatThreadBindingDurationLabel(2 * 60 * 60 * 1000)).toBe("2h");
    expect(formatThreadBindingDurationLabel(90 * 60 * 1000)).toBe("1h30m");
    expect(formatThreadBindingDurationLabel(45 * 1000)).toBe("45s");
  });

  it("returns an empty string for missing/zero durations", () => {
    expect(formatThreadBindingDurationLabel(0)).toBe("");
    expect(formatThreadBindingDurationLabel(undefined)).toBe("");
    expect(formatThreadBindingDurationLabel(null)).toBe("");
  });
});
