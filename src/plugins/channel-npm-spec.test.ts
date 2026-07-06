import { describe, expect, it } from "vitest";
import { resolveChannelAwareNpmSpec } from "./channel-npm-spec.js";

describe("resolveChannelAwareNpmSpec", () => {
  it("pins bare npm specs to the package prerelease version", () => {
    expect(
      resolveChannelAwareNpmSpec({
        npmSpec: "@remoteclaw/twitch",
        packageName: "@remoteclaw/twitch",
        packageVersion: "2026.5.2-beta.2",
      }),
    ).toBe("@remoteclaw/twitch@2026.5.2-beta.2");
  });

  it("targets the beta dist-tag for bare plugin specs on beta channel", () => {
    expect(
      resolveChannelAwareNpmSpec({
        npmSpec: "@remoteclaw/twitch",
        channel: "beta",
      }),
    ).toBe("@remoteclaw/twitch@beta");
  });

  it("preserves explicit versions and tags", () => {
    expect(
      resolveChannelAwareNpmSpec({
        npmSpec: "@remoteclaw/twitch@2026.5.2-beta.2",
        channel: "beta",
      }),
    ).toBe("@remoteclaw/twitch@2026.5.2-beta.2");
    expect(
      resolveChannelAwareNpmSpec({
        npmSpec: "@remoteclaw/twitch@latest",
        packageVersion: "2026.5.2-beta.2",
      }),
    ).toBe("@remoteclaw/twitch@latest");
  });
});
