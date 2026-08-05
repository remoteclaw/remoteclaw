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

  // Scope pin for the dig(1) operand predicate (`isUnsafeDigOperand`). dig reads
  // a leading '@' as a nameserver selector and a leading '+' as an option; ssh(1)
  // reads neither that way, so those prefixes must NOT have leaked into this
  // guard when the dig path was hardened. A failure here means the shared
  // primitive was widened instead of composed, changing ssh host admission.
  it("is unchanged by dig's operand rules: '@' and '+' are not ssh options", () => {
    expect(isUnsafeSshHost("@127.0.0.1")).toBe(false);
    expect(isUnsafeSshHost("+tcp")).toBe(false);
    expect(isUnsafeSshHost("user@studio.ts.net")).toBe(false);
  });
});
