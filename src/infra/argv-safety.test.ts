// Covers the shared argv-operand denylist used by the SSH host guard and by the
// mDNS/DNS discovery producers, plus the wider dig(1)-specific predicate.
import { describe, expect, it } from "vitest";
import { isArgvOptionLike, isUnsafeDigOperand } from "./argv-safety.js";

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

  // The load-bearing property of keeping this predicate narrow. `isUnsafeSshHost`
  // composes it, and dig's extra prefixes carry no meaning for ssh(1) or dns-sd,
  // so folding them in here would change the SSH guard's behaviour for no gain.
  // If this ever flips, the ssh host denylist silently widened with it.
  it("stays narrow: dig's '@' and '+' are not option-like to the shared primitive", () => {
    expect(isArgvOptionLike("@127.0.0.1")).toBe(false);
    expect(isArgvOptionLike("+tcp")).toBe(false);
  });
});

describe("isUnsafeDigOperand", () => {
  // dig(1) reads two prefixes that no other tool here does, and both were probed
  // against the system dig: '@' selects the nameserver positionally with the LAST
  // one winning (so an '@'-prefixed query name re-points the query at an
  // arbitrary host:53), and '+' introduces an option (so '+tcp' in the query-name
  // slot is consumed as one, collapsing the query name to ".").
  it("flags dig's nameserver and option prefixes, not just '-'", () => {
    expect(isUnsafeDigOperand("@127.0.0.1")).toBe(true);
    expect(isUnsafeDigOperand("@evil.example.com")).toBe(true);
    expect(isUnsafeDigOperand("+tcp")).toBe(true);
    expect(isUnsafeDigOperand("+short")).toBe(true);
  });

  // Composition with the shared primitive: everything '-' still rejects.
  it("still flags everything the shared primitive flags", () => {
    expect(isUnsafeDigOperand("-f/etc/passwd")).toBe(true);
    expect(isUnsafeDigOperand("--")).toBe(true);
    expect(isUnsafeDigOperand("-")).toBe(true);
  });

  // Over-rejection guard. Only the LEADING character is structural to dig; the
  // same characters in any interior position are ordinary data.
  it("leaves ordinary query names alone, including interior '@' and '+'", () => {
    expect(isUnsafeDigOperand("studio-gateway._remoteclaw-gw._tcp.example.")).toBe(false);
    expect(isUnsafeDigOperand("studio+lab._remoteclaw-gw._tcp.example.")).toBe(false);
    expect(isUnsafeDigOperand("desk@home._remoteclaw-gw._tcp.example.")).toBe(false);
    expect(isUnsafeDigOperand("peters-mac-studio-1.sheep-coho.ts.net")).toBe(false);
    expect(isUnsafeDigOperand("")).toBe(false);
  });
});
