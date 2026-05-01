import { afterEach, describe, expect, it, vi } from "vitest";
import { browserOpenTab, browserStatus, browserTabs } from "./client.js";

describe("browser client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wraps connection failures with a sandbox hint", async () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1"), {
      code: "ECONNREFUSED",
    });
    const fetchFailed = Object.assign(new TypeError("fetch failed"), {
      cause: refused,
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(fetchFailed));

    await expect(browserStatus("http://127.0.0.1:18791")).rejects.toThrow(/sandboxed session/i);
  });

  it("adds useful timeout messaging for abort-like failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));
    await expect(browserStatus("http://127.0.0.1:18791")).rejects.toThrow(/timed out/i);
  });

  it("surfaces non-2xx responses with body text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () => "conflict",
      } as unknown as Response),
    );

    await expect(browserTabs("http://127.0.0.1:18791")).rejects.toThrow(/conflict/i);
  });

  it("uses the expected endpoints + methods for common calls", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith("/tabs") && (!init || init.method === undefined)) {
          return {
            ok: true,
            json: async () => ({
              running: true,
              tabs: [{ targetId: "t1", title: "T", url: "https://x" }],
            }),
          } as unknown as Response;
        }
        if (url.endsWith("/tabs/open")) {
          return {
            ok: true,
            json: async () => ({
              targetId: "t2",
              title: "N",
              url: "https://y",
            }),
          } as unknown as Response;
        }
        return {
          ok: true,
          json: async () => ({
            enabled: true,
            running: true,
            cdpPort: 18792,
            cdpUrl: "http://127.0.0.1:18792",
            color: "#FF4500",
            headless: false,
            noSandbox: false,
            attachOnly: false,
          }),
        } as unknown as Response;
      }),
    );

    await expect(browserStatus("http://127.0.0.1:18791")).resolves.toMatchObject({
      running: true,
      cdpPort: 18792,
    });

    await expect(browserTabs("http://127.0.0.1:18791")).resolves.toHaveLength(1);
    await expect(browserOpenTab("http://127.0.0.1:18791", "https://example.com")).resolves.toMatchObject({
      targetId: "t2",
    });

    expect(calls.some((c) => c.url.endsWith("/tabs"))).toBe(true);
    const open = calls.find((c) => c.url.endsWith("/tabs/open"));
    expect(open?.init?.method).toBe("POST");
  });
});
