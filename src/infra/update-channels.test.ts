import { describe, expect, it } from "vitest";
import {
  channelToNpmTag,
  DEFAULT_PACKAGE_CHANNEL,
  normalizeUpdateChannel,
  resolveEffectiveUpdateChannel,
} from "./update-channels.js";

describe("update-channels", () => {
  describe("normalizeUpdateChannel", () => {
    it("accepts stable, beta, next", () => {
      expect(normalizeUpdateChannel("stable")).toBe("stable");
      expect(normalizeUpdateChannel("beta")).toBe("beta");
      expect(normalizeUpdateChannel("next")).toBe("next");
    });

    it("maps dev to next for backward compat", () => {
      expect(normalizeUpdateChannel("dev")).toBe("next");
    });

    it("is case-insensitive", () => {
      expect(normalizeUpdateChannel("STABLE")).toBe("stable");
      expect(normalizeUpdateChannel("Beta")).toBe("beta");
      expect(normalizeUpdateChannel("NEXT")).toBe("next");
      expect(normalizeUpdateChannel("DEV")).toBe("next");
    });

    it("returns null for invalid values", () => {
      expect(normalizeUpdateChannel("")).toBeNull();
      expect(normalizeUpdateChannel(null)).toBeNull();
      expect(normalizeUpdateChannel(undefined)).toBeNull();
      expect(normalizeUpdateChannel("nightly")).toBeNull();
    });
  });

  describe("channelToNpmTag", () => {
    it("maps channels to npm tags", () => {
      expect(channelToNpmTag("stable")).toBe("latest");
      expect(channelToNpmTag("beta")).toBe("beta");
      expect(channelToNpmTag("next")).toBe("next");
    });
  });

  describe("DEFAULT_PACKAGE_CHANNEL", () => {
    it("defaults to next (pre-1.0)", () => {
      expect(DEFAULT_PACKAGE_CHANNEL).toBe("next");
    });
  });

  describe("resolveEffectiveUpdateChannel", () => {
    it("uses config channel when set", () => {
      const result = resolveEffectiveUpdateChannel({ configChannel: "beta" });
      expect(result.channel).toBe("beta");
      expect(result.source).toBe("config");
    });

    it("falls back to default when no config", () => {
      const result = resolveEffectiveUpdateChannel({});
      expect(result.channel).toBe("next");
      expect(result.source).toBe("default");
    });
  });
});
