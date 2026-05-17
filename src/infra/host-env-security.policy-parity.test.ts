import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type HostEnvSecurityPolicy = {
  blockedEverywhereKeys: string[];
  blockedOverrideOnlyKeys?: string[];
  blockedOverridePrefixes?: string[];
  blockedPrefixes: string[];
};

function parseSwiftStringArray(source: string, marker: string): string[] {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escapedMarker}[\\s\\S]*?=\\s*\\[([\\s\\S]*?)\\]`, "m");
  const match = source.match(re);
  if (!match) {
    throw new Error(`Failed to parse Swift array for marker: ${marker}`);
  }
  return Array.from(match[1].matchAll(/"([^"]+)"/g), (m) => m[1]);
}

describe("host env security policy parity", () => {
  it("keeps generated macOS host env policy in sync with shared JSON policy", () => {
    const repoRoot = process.cwd();
    const policyPath = path.join(repoRoot, "src/infra/host-env-security-policy.json");
    const generatedSwiftPath = path.join(
      repoRoot,
      "apps/macos/Sources/RemoteClaw/HostEnvSecurityPolicy.generated.swift",
    );
    const sanitizerSwiftPath = path.join(
      repoRoot,
      "apps/macos/Sources/RemoteClaw/HostEnvSanitizer.swift",
    );

    const policy = JSON.parse(fs.readFileSync(policyPath, "utf8")) as HostEnvSecurityPolicy;
    const generatedSource = fs.readFileSync(generatedSwiftPath, "utf8");
    const sanitizerSource = fs.readFileSync(sanitizerSwiftPath, "utf8");

    const swiftBlockedKeys = parseSwiftStringArray(generatedSource, "static let blockedKeys:");
    const swiftBlockedOverrideKeys = parseSwiftStringArray(
      generatedSource,
      "static let blockedOverrideKeys:",
    );
    const swiftBlockedOverridePrefixes = parseSwiftStringArray(
      generatedSource,
      "static let blockedOverridePrefixes:",
    );
    const swiftBlockedPrefixes = parseSwiftStringArray(
      generatedSource,
      "static let blockedPrefixes:",
    );

    // Swift generator emits sorted Sets; JSON preserves insertion order. Compare
    // as sets for equivalence and confirm cardinality matches.
    expect(new Set(swiftBlockedKeys)).toEqual(new Set(policy.blockedEverywhereKeys));
    expect(new Set(swiftBlockedOverrideKeys)).toEqual(
      new Set(policy.blockedOverrideOnlyKeys ?? []),
    );
    expect(new Set(swiftBlockedOverridePrefixes)).toEqual(
      new Set(policy.blockedOverridePrefixes ?? []),
    );
    expect(new Set(swiftBlockedPrefixes)).toEqual(new Set(policy.blockedPrefixes));

    expect(sanitizerSource).toContain(
      "private static let blockedKeys = HostEnvSecurityPolicy.blockedKeys",
    );
    expect(sanitizerSource).toContain(
      "private static let blockedOverrideKeys = HostEnvSecurityPolicy.blockedOverrideKeys",
    );
    expect(sanitizerSource).toContain(
      "private static let blockedOverridePrefixes = HostEnvSecurityPolicy.blockedOverridePrefixes",
    );
    expect(sanitizerSource).toContain(
      "private static let blockedPrefixes = HostEnvSecurityPolicy.blockedPrefixes",
    );
  });
});
