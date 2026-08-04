// Tests npm registry spec parsing for packages, tags, and versions.
import { describe, expect, it } from "vitest";
import {
  compareRemoteClawReleaseVersions,
  findUnclaimedNpmScope,
  findUnclaimedNpmScopeForPackageName,
  formatPrereleaseResolutionError,
  formatUnclaimedNpmScopeDependencyError,
  formatUnclaimedNpmScopeError,
  isExactSemverVersion,
  isRemoteClawOrgNpmSpec,
  isRemoteClawStableCorrectionVersion,
  isPrereleaseSemverVersion,
  isPrereleaseResolutionAllowed,
  parseRegistryNpmSpec,
  UNCLAIMED_FIRST_PARTY_NPM_SCOPES,
  validateRegistryNpmSpec,
} from "./npm-registry-spec.js";

function parseSpecOrThrow(spec: string) {
  const parsed = parseRegistryNpmSpec(spec);
  if (parsed === null) {
    throw new Error(`Expected ${spec} to parse`);
  }
  return parsed;
}

describe("npm registry spec validation", () => {
  it.each([
    "@remoteclaw/voice-call",
    "@remoteclaw/voice-call@1.2.3",
    "@remoteclaw/voice-call@1.2.3-beta.4",
    "@remoteclaw/voice-call@latest",
    "@remoteclaw/voice-call@beta",
  ])("accepts %s", (spec) => {
    expect(validateRegistryNpmSpec(spec)).toBeNull();
  });

  it.each([
    {
      spec: "@remoteclaw/voice-call@^1.2.3",
      expected: "exact version or dist-tag",
    },
    {
      spec: "@remoteclaw/voice-call@~1.2.3",
      expected: "exact version or dist-tag",
    },
    {
      spec: "https://npmjs.org/pkg.tgz",
      expected: "URLs are not allowed",
    },
    {
      spec: "git+ssh://github.com/remoteclaw/remoteclaw",
      expected: "URLs are not allowed",
    },
    {
      spec: "@remoteclaw/voice-call@",
      expected: "missing version/tag after @",
    },
    {
      spec: "@remoteclaw/voice-call@../beta",
      expected: "invalid version/tag",
    },
  ])("rejects %s", ({ spec, expected }) => {
    expect(validateRegistryNpmSpec(spec)).toContain(expected);
  });
});

describe("npm registry spec parsing helpers", () => {
  it.each([
    {
      spec: "@remoteclaw/voice-call",
      expected: {
        name: "@remoteclaw/voice-call",
        raw: "@remoteclaw/voice-call",
        selectorKind: "none",
        selectorIsPrerelease: false,
      },
    },
    {
      spec: "@remoteclaw/voice-call@beta",
      expected: {
        name: "@remoteclaw/voice-call",
        raw: "@remoteclaw/voice-call@beta",
        selector: "beta",
        selectorKind: "tag",
        selectorIsPrerelease: false,
      },
    },
    {
      spec: "@remoteclaw/voice-call@2026.5.3-1",
      expected: {
        name: "@remoteclaw/voice-call",
        raw: "@remoteclaw/voice-call@2026.5.3-1",
        selector: "2026.5.3-1",
        selectorKind: "exact-version",
        selectorIsPrerelease: false,
      },
    },
    {
      spec: "@remoteclaw/voice-call@1.2.3-beta.1",
      expected: {
        name: "@remoteclaw/voice-call",
        raw: "@remoteclaw/voice-call@1.2.3-beta.1",
        selector: "1.2.3-beta.1",
        selectorKind: "exact-version",
        selectorIsPrerelease: true,
      },
    },
  ])("parses %s", ({ spec, expected }) => {
    expect(parseRegistryNpmSpec(spec)).toEqual(expected);
  });

  it.each([
    { spec: "@remoteclaw/voice-call", expected: true },
    { spec: "@remoteclaw/voice-call@1.2.3", expected: true },
    { spec: "@other/voice-call", expected: false },
    { spec: "voice-call", expected: false },
    { spec: "npm:@remoteclaw/voice-call", expected: false },
    { spec: undefined, expected: false },
  ])("detects RemoteClaw-org npm specs for %s", ({ spec, expected }) => {
    expect(isRemoteClawOrgNpmSpec(spec)).toBe(expected);
  });

  it.each([
    { value: "v1.2.3", expected: true },
    { value: "1.2", expected: false },
  ])("detects exact semver versions for %s", ({ value, expected }) => {
    expect(isExactSemverVersion(value)).toBe(expected);
  });

  it.each([
    { value: "1.2.3-beta.1", expected: true },
    { value: "1.2.3-1", expected: true },
    { value: "2026.5.3-beta.1", expected: true },
    { value: "2026.5.3-1", expected: false },
    { value: "2026.2.30-1", expected: false },
    { value: "1.2.3", expected: false },
  ])("detects prerelease semver versions for %s", ({ value, expected }) => {
    expect(isPrereleaseSemverVersion(value)).toBe(expected);
  });

  it.each([
    { value: "2026.5.3-1", expected: true },
    { value: "2026.5.3-2", expected: true },
    { value: "2026.5.3-beta.1", expected: false },
    { value: "1.2.3-1", expected: false },
    { value: "2026.2.30-1", expected: true },
  ])("detects RemoteClaw stable correction versions for %s", ({ value, expected }) => {
    expect(isRemoteClawStableCorrectionVersion(value)).toBe(expected);
  });

  it.each([
    { left: "2026.5.3-1", right: "2026.5.3", expected: 1 },
    { left: "2026.5.3-2", right: "2026.5.3-1", expected: 1 },
    { left: "2026.5.3", right: "2026.5.3-beta.3", expected: 1 },
    { left: "2026.5.3-beta.3", right: "2026.5.3-alpha.9", expected: 1 },
    { left: "1.2.3-1", right: "1.2.3", expected: null },
  ])("compares RemoteClaw release versions for %s and %s", ({ left, right, expected }) => {
    expect(compareRemoteClawReleaseVersions(left, right)).toBe(expected);
  });
});

describe("npm prerelease resolution policy", () => {
  it.each([
    {
      spec: "@remoteclaw/voice-call",
      resolvedVersion: "1.2.3-beta.1",
      expected: false,
    },
    {
      spec: "@remoteclaw/voice-call@latest",
      resolvedVersion: "1.2.3-rc.1",
      expected: false,
    },
    {
      spec: "@remoteclaw/voice-call@latest",
      resolvedVersion: "2026.5.3-1",
      expected: true,
    },
    {
      spec: "@remoteclaw/voice-call@beta",
      resolvedVersion: "1.2.3-beta.4",
      expected: true,
    },
    {
      spec: "@remoteclaw/voice-call@1.2.3-beta.1",
      resolvedVersion: "1.2.3-beta.1",
      expected: true,
    },
    {
      spec: "@remoteclaw/voice-call",
      resolvedVersion: "1.2.3",
      expected: true,
    },
    {
      spec: "@remoteclaw/voice-call@latest",
      resolvedVersion: undefined,
      expected: true,
    },
  ])("decides prerelease resolution for %s -> %s", ({ spec, resolvedVersion, expected }) => {
    expect(
      isPrereleaseResolutionAllowed({
        spec: parseSpecOrThrow(spec),
        resolvedVersion,
      }),
    ).toBe(expected);
  });

  it.each([
    {
      spec: "@remoteclaw/voice-call",
      resolvedVersion: "1.2.3-beta.1",
      expected: `Use "@remoteclaw/voice-call@beta"`,
    },
    {
      spec: "@remoteclaw/voice-call@beta",
      resolvedVersion: "1.2.3-rc.1",
      expected: "Use an explicit prerelease tag or exact prerelease version",
    },
  ])("formats prerelease guidance for %s", ({ spec, resolvedVersion, expected }) => {
    expect(
      formatPrereleaseResolutionError({
        spec: parseSpecOrThrow(spec),
        resolvedVersion,
      }),
    ).toContain(expected);
  });
});

describe("unclaimed first-party npm scope guard", () => {
  it.each([
    "@remoteclaw/discord",
    "@remoteclaw/slack",
    "@remoteclaw/whatsapp",
    "@remoteclaw/discord@1.2.3",
    "@remoteclaw/discord@latest",
  ])("refuses %s because the scope is not registered", (spec) => {
    expect(findUnclaimedNpmScope(spec)).toBe("@remoteclaw");
  });

  it.each([
    // The unscoped package IS published by this project — blocking it would be a
    // self-inflicted outage, so the guard must match the scope segment, not a substring.
    "remoteclaw",
    "remoteclaw@1.2.3",
    "remoteclaw-plugin-yuanbao@2.15.0",
    // Adjacent scopes belong to other people; over-blocking them is not ours to do.
    "@remoteclaw-community/discord",
    // Real third-party catalog entries must keep resolving.
    "@wecom/wecom-remoteclaw-plugin@2026.5.7",
    "@tencent-weixin/remoteclaw-weixin@2.4.3",
  ])("allows %s", (spec) => {
    expect(findUnclaimedNpmScope(spec)).toBeNull();
  });

  it("returns null for specs that do not parse, leaving rejection to the validator", () => {
    expect(findUnclaimedNpmScope("https://evil.example/pkg.tgz")).toBeNull();
    expect(findUnclaimedNpmScope("@remoteclaw/discord@^1.0.0")).toBeNull();
    expect(findUnclaimedNpmScope(undefined)).toBeNull();
    // ...but the validator still rejects them, so nothing is admitted by the pair.
    expect(validateRegistryNpmSpec("https://evil.example/pkg.tgz")).not.toBeNull();
    expect(validateRegistryNpmSpec("@remoteclaw/discord@^1.0.0")).not.toBeNull();
  });

  it("keeps the scope list explicit so registering a scope is a reviewed change", () => {
    expect(UNCLAIMED_FIRST_PARTY_NPM_SCOPES).toEqual(["@remoteclaw"]);
  });

  it("explains why the install was refused and how to proceed", () => {
    const message = formatUnclaimedNpmScopeError({
      spec: "@remoteclaw/discord",
      scope: "@remoteclaw",
    });
    expect(message).toContain("@remoteclaw/discord");
    expect(message).toContain("not registered");
    expect(message).toContain("dependency confusion");
    // The two routes an operator actually has: bundled channel, or a local build.
    expect(message).toContain("already bundled");
    expect(message).toContain("remoteclaw plugins install ./my-plugin");
  });
});

describe("unclaimed scope guard for declared dependencies", () => {
  it.each(["@remoteclaw/telemetry-core", "@remoteclaw/anything"])(
    "flags dependency name %s",
    (name) => {
      expect(findUnclaimedNpmScopeForPackageName(name)).toBe("@remoteclaw");
    },
  );

  it.each(["remoteclaw", "@remoteclaw-community/x", "left-pad", "@wecom/plugin"])(
    "leaves dependency name %s alone",
    (name) => {
      expect(findUnclaimedNpmScopeForPackageName(name)).toBeNull();
    },
  );

  it("names the offending dependencies and why they are refused", () => {
    const message = formatUnclaimedNpmScopeDependencyError({
      dependencies: ["@remoteclaw/a", "@remoteclaw/b"],
      scope: "@remoteclaw",
    });
    expect(message).toContain("@remoteclaw/a, @remoteclaw/b");
    expect(message).toContain("not registered");
    expect(message).toContain("dependency confusion");
  });
});
