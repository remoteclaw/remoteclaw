// Covers the shared argv-operand denylist used by the SSH host guard and by the
// mDNS/DNS discovery producers.
import { describe, expect, it } from "vitest";
import { isArgvOptionLike } from "./argv-safety.js";

describe("isArgvOptionLike", () => {
  it("flags values a tool would parse as an option", () => {
    expect(isArgvOptionLike("-f/etc/passwd")).toBe(true);
    expect(isArgvOptionLike("-oProxyCommand=touch /tmp/pwned")).toBe(true);
    expect(isArgvOptionLike("--")).toBe(true);
    expect(isArgvOptionLike("-")).toBe(true);
  });

  // Regression guard. These are all values real callers carry: mDNS instance
  // names are free-form UTF-8 (RFC 6763 §4.1.1) and DNS names have interior
  // hyphens. A guard that rejected '-' anywhere, or non-ASCII, or spaces, would
  // break ordinary discovery while still reading as "hardened".
  it("leaves ordinary operands alone", () => {
    expect(isArgvOptionLike("Laptop Gateway")).toBe(false);
    expect(isArgvOptionLike("peters-mac-studio-1.sheep-coho.ts.net")).toBe(false);
    expect(isArgvOptionLike("Peter’s Mac Studio")).toBe(false);
    expect(isArgvOptionLike("studio-gateway._remoteclaw-gw._tcp.example.")).toBe(false);
    expect(isArgvOptionLike("")).toBe(false);
  });
});
