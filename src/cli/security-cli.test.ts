import { describe, expect, it } from "vitest";
import { parseGatewayAuthMode } from "./security-cli.js";

describe("parseGatewayAuthMode", () => {
  it("returns undefined when the flag is absent or blank", () => {
    expect(parseGatewayAuthMode(undefined)).toBeUndefined();
    expect(parseGatewayAuthMode("")).toBeUndefined();
    expect(parseGatewayAuthMode("   ")).toBeUndefined();
  });

  it("accepts every valid gateway auth mode", () => {
    expect(parseGatewayAuthMode("none")).toBe("none");
    expect(parseGatewayAuthMode("token")).toBe("token");
    expect(parseGatewayAuthMode("password")).toBe("password");
    expect(parseGatewayAuthMode("trusted-proxy")).toBe("trusted-proxy");
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(parseGatewayAuthMode("  NONE  ")).toBe("none");
    expect(parseGatewayAuthMode("Token")).toBe("token");
  });

  it("throws a clear error on an unrecognized mode", () => {
    expect(() => parseGatewayAuthMode("bogus")).toThrow(/Invalid --auth value/);
    expect(() => parseGatewayAuthMode("trusted proxy")).toThrow(/Invalid --auth value/);
  });
});
