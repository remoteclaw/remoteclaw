// Covers the shared SSH host denylist used by the tunnel parser and discovery.
import { describe, expect, it } from "vitest";
import { isUnsafeSshHost } from "./ssh-host-safety.js";

describe("isUnsafeSshHost", () => {
  it("rejects hosts ssh(1) would parse as an option", () => {
    expect(isUnsafeSshHost("-V")).toBe(true);
    expect(isUnsafeSshHost("-oProxyCommand=touch /tmp/pwned")).toBe(true);
    expect(isUnsafeSshHost("-oproxycommand=x")).toBe(true);
    expect(isUnsafeSshHost("-J")).toBe(true);
  });

  it("rejects hosts with a stray leading or trailing colon", () => {
    expect(isUnsafeSshHost(":22")).toBe(true);
    expect(isUnsafeSshHost("host:")).toBe(true);
  });

  it("rejects empty and whitespace-bearing hosts", () => {
    expect(isUnsafeSshHost("")).toBe(true);
    expect(isUnsafeSshHost("host name")).toBe(true);
    expect(isUnsafeSshHost("host\tname")).toBe(true);
    expect(isUnsafeSshHost("host\nname")).toBe(true);
  });

  // Regression guard: an interior hyphen is ordinary in a hostname. A denylist
  // that rejects '-' anywhere rather than only in the leading position would
  // break most real tailnet and LAN names while still reading as "hardened".
  it("accepts ordinary hostnames, including hyphenated labels", () => {
    expect(isUnsafeSshHost("studio")).toBe(false);
    expect(isUnsafeSshHost("peters-mac-studio-1.sheep-coho.ts.net")).toBe(false);
    expect(isUnsafeSshHost("my-host.example.com")).toBe(false);
    expect(isUnsafeSshHost("host-")).toBe(false);
    expect(isUnsafeSshHost("192.168.1.10")).toBe(false);
    expect(isUnsafeSshHost("100.64.0.9")).toBe(false);
    expect(isUnsafeSshHost("under_score")).toBe(false);
  });
});
