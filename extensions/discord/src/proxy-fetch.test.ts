import { describe, expect, it, vi } from "vitest";
import { validateDiscordProxyUrl, withValidatedDiscordProxy } from "./proxy-fetch.js";

describe("validateDiscordProxyUrl", () => {
  it.each([
    ["http://127.0.0.1:8080", "IPv4 loopback"],
    ["https://127.0.0.1:8443", "IPv4 loopback over https"],
    ["http://127.9.9.9:8080", "127.0.0.0/8 range"],
    ["http://[::1]:8080", "IPv6 loopback"],
    ["http://[0:0:0:0:0:0:0:1]:8080", "expanded IPv6 loopback"],
    ["http://localhost:8080", "localhost"],
    ["http://LOCALHOST:8080", "localhost is case-insensitive"],
  ])("accepts %s (%s)", (proxyUrl) => {
    expect(validateDiscordProxyUrl(proxyUrl)).toBe(proxyUrl);
  });

  it.each([
    ["http://proxy.test:8080", "remote hostname"],
    ["http://10.0.0.1:8080", "private but non-loopback IPv4"],
    ["http://169.254.169.254/", "cloud metadata endpoint"],
    ["http://[::ffff:127.0.0.1]:8080", "IPv4-mapped IPv6 loopback"],
    ["http://127.0.0.1.evil.test:8080", "loopback-prefixed hostname"],
  ])("rejects %s (%s) as non-loopback", (proxyUrl) => {
    expect(() => validateDiscordProxyUrl(proxyUrl)).toThrow("loopback host");
  });

  it.each([
    ["socks5://127.0.0.1:1080", "non-http scheme"],
    ["ftp://127.0.0.1", "ftp scheme"],
  ])("rejects %s (%s)", (proxyUrl) => {
    expect(() => validateDiscordProxyUrl(proxyUrl)).toThrow("http or https");
  });

  it("rejects a malformed URL", () => {
    expect(() => validateDiscordProxyUrl("bad-proxy")).toThrow("valid http or https URL");
  });
});

describe("withValidatedDiscordProxy", () => {
  it("invokes the factory with the trimmed proxy URL when valid", () => {
    const runtime = { error: vi.fn() };
    const createValue = vi.fn(() => "dispatcher");

    expect(withValidatedDiscordProxy("  http://127.0.0.1:8080  ", runtime, createValue)).toBe(
      "dispatcher",
    );
    expect(createValue).toHaveBeenCalledWith("http://127.0.0.1:8080");
    expect(runtime.error).not.toHaveBeenCalled();
  });

  it("returns undefined and reports the error without invoking the factory when remote", () => {
    const runtime = { error: vi.fn() };
    const createValue = vi.fn();

    expect(
      withValidatedDiscordProxy("http://proxy.test:8080", runtime, createValue),
    ).toBeUndefined();
    expect(createValue).not.toHaveBeenCalled();
    expect(String(runtime.error.mock.calls[0]?.[0])).toContain("loopback host");
  });

  it.each<string | undefined>([undefined, "", "   "])(
    "returns undefined without reporting an error for a blank proxy URL (%j)",
    (proxyUrl) => {
      const runtime = { error: vi.fn() };
      const createValue = vi.fn();

      expect(withValidatedDiscordProxy(proxyUrl, runtime, createValue)).toBeUndefined();
      expect(createValue).not.toHaveBeenCalled();
      expect(runtime.error).not.toHaveBeenCalled();
    },
  );

  it("does not throw when no runtime is supplied", () => {
    expect(() =>
      withValidatedDiscordProxy("http://proxy.test:8080", undefined, vi.fn()),
    ).not.toThrow();
  });
});
