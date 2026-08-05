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
  it("stays narrow: dig's '+', '%' and '@' are not option-like to the shared primitive", () => {
    expect(isArgvOptionLike("@127.0.0.1")).toBe(false);
    expect(isArgvOptionLike("+tcp")).toBe(false);
    expect(isArgvOptionLike("%evil")).toBe(false);
  });
});

describe("isUnsafeDigOperand", () => {
  // dig(1) reads three prefixes that no other tool here does. All were probed
  // against the system dig (DiG 9.10.6) with a loopback listener:
  //   '+' introduces an option, so '+tcp' in the query-name slot is consumed as
  //       one and the query name collapses to ".".
  //   '%' is discarded as a positional, so '%evil' collapses the query to a root
  //       ". IN NS" sent to the ALREADY-PINNED nameserver. No redirect.
  //   '@' selects the nameserver — see the '@' case below for why that one is
  //       defence-in-depth rather than a reachable path.
  // Split per prefix so one failing expect cannot mask the others.
  it("flags dig's option prefix '+'", () => {
    expect(isUnsafeDigOperand("+tcp")).toBe(true);
    expect(isUnsafeDigOperand("+short")).toBe(true);
    expect(isUnsafeDigOperand("+tcp._remoteclaw-gw._tcp.example.")).toBe(true);
  });

  it("flags dig's discarded positional prefix '%'", () => {
    expect(isUnsafeDigOperand("%evil")).toBe(true);
    expect(isUnsafeDigOperand("%")).toBe(true);
    expect(isUnsafeDigOperand("%evil._remoteclaw-gw._tcp.example.")).toBe(true);
  });

  // Defence-in-depth, deliberately kept. DiG 9.10.6 escapes '@' when printing a
  // name, so a hostile PTR answer arrives as "\@evil…" and never reaches this
  // predicate with a bare '@' — the guard is insurance against a dig earlier on
  // PATH that does not escape it, not a demonstrated path. Only 9.10.6 was
  // probed, so the escaping is untested elsewhere rather than known-universal.
  it("flags dig's nameserver selector '@'", () => {
    expect(isUnsafeDigOperand("@127.0.0.1")).toBe(true);
    expect(isUnsafeDigOperand("@evil.example.com")).toBe(true);
  });

  // Composition with the shared primitive: everything '-' still rejects.
  it("still flags everything the shared primitive flags", () => {
    expect(isUnsafeDigOperand("-f/etc/passwd")).toBe(true);
    expect(isUnsafeDigOperand("--")).toBe(true);
    expect(isUnsafeDigOperand("-")).toBe(true);
  });

  // Over-rejection guard. Only the LEADING character is structural to dig; the
  // same characters in any interior position are ordinary data.
  it("leaves ordinary query names alone, including interior '+', '%' and '@'", () => {
    expect(isUnsafeDigOperand("studio-gateway._remoteclaw-gw._tcp.example.")).toBe(false);
    expect(isUnsafeDigOperand("studio+lab._remoteclaw-gw._tcp.example.")).toBe(false);
    expect(isUnsafeDigOperand("desk@home._remoteclaw-gw._tcp.example.")).toBe(false);
    expect(isUnsafeDigOperand("rate%limit._remoteclaw-gw._tcp.example.")).toBe(false);
    expect(isUnsafeDigOperand("peters-mac-studio-1.sheep-coho.ts.net")).toBe(false);
    expect(isUnsafeDigOperand("")).toBe(false);
  });
});
