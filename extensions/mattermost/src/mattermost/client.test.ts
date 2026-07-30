// Mattermost tests cover client plugin behavior.
import { describe, expect, it, vi } from "vitest";
import {
  createMattermostClient,
  createMattermostPost,
  normalizeMattermostBaseUrl,
  readMattermostError,
  updateMattermostPost,
} from "./client.js";

// ── Helper: mock fetch that captures requests ────────────────────────

function createMockFetch(response?: { status?: number; body?: unknown; contentType?: string }) {
  const status = response?.status ?? 200;
  const body = response?.body ?? {};
  const contentType = response?.contentType ?? "application/json";

  const calls: Array<{ url: string; init?: RequestInit }> = [];

  const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = requestUrl(url);
    calls.push({ url: urlStr, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": contentType },
    });
  });

  return { mockFetch: mockFetch as typeof fetch, calls };
}

function requestUrl(url: string | URL | Request): string {
  if (typeof url === "string") {
    return url;
  }
  if (url instanceof URL) {
    return url.toString();
  }
  return url.url;
}

function parseRequestJson(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== "string") {
    throw new Error("expected JSON request body");
  }
  const parsed: unknown = JSON.parse(init.body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("expected JSON object request body");
  }
  return parsed as Record<string, unknown>;
}

function createTestClient(response?: { status?: number; body?: unknown; contentType?: string }) {
  const { mockFetch, calls } = createMockFetch(response);
  const client = createMattermostClient({
    baseUrl: "http://localhost:8065",
    botToken: "tok",
    fetchImpl: mockFetch,
  });
  return { client, calls };
}

async function updatePostAndCapture(
  update: Parameters<typeof updateMattermostPost>[2],
  response?: { status?: number; body?: unknown; contentType?: string },
) {
  const { client, calls } = createTestClient(response ?? { body: { id: "post1" } });
  await updateMattermostPost(client, "post1", update);
  return {
    calls,
    body: parseRequestJson(calls[0].init),
  };
}

// ── normalizeMattermostBaseUrl ────────────────────────────────────────

describe("normalizeMattermostBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeMattermostBaseUrl("http://localhost:8065/")).toBe("http://localhost:8065");
  });

  it("strips /api/v4 suffix", () => {
    expect(normalizeMattermostBaseUrl("http://localhost:8065/api/v4")).toBe(
      "http://localhost:8065",
    );
  });

  it("returns undefined for empty input", () => {
    expect(normalizeMattermostBaseUrl("")).toBeUndefined();
    expect(normalizeMattermostBaseUrl(null)).toBeUndefined();
    expect(normalizeMattermostBaseUrl(undefined)).toBeUndefined();
  });

  it("preserves valid base URL", () => {
    expect(normalizeMattermostBaseUrl("http://mm.example.com")).toBe("http://mm.example.com");
  });
});

// ── createMattermostClient ───────────────────────────────────────────

describe("createMattermostClient", () => {
  it("creates a client with normalized baseUrl", () => {
    const { mockFetch } = createMockFetch();
    const client = createMattermostClient({
      baseUrl: "http://localhost:8065/",
      botToken: "tok",
      fetchImpl: mockFetch,
    });
    expect(client.baseUrl).toBe("http://localhost:8065");
    expect(client.apiBaseUrl).toBe("http://localhost:8065/api/v4");
  });

  it("throws on empty baseUrl", () => {
    expect(() => createMattermostClient({ baseUrl: "", botToken: "tok" })).toThrow(
      "baseUrl is required",
    );
  });

  it("sends Authorization header with Bearer token", async () => {
    const { mockFetch, calls } = createMockFetch({ body: { id: "u1" } });
    const client = createMattermostClient({
      baseUrl: "http://localhost:8065",
      botToken: "my-secret-token",
      fetchImpl: mockFetch,
    });
    await client.request("/users/me");
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer my-secret-token");
  });

  it("sets Content-Type for string bodies", async () => {
    const { mockFetch, calls } = createMockFetch({ body: { id: "p1" } });
    const client = createMattermostClient({
      baseUrl: "http://localhost:8065",
      botToken: "tok",
      fetchImpl: mockFetch,
    });
    await client.request("/posts", { method: "POST", body: JSON.stringify({ message: "hi" }) });
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("throws on non-ok responses", async () => {
    const { mockFetch } = createMockFetch({
      status: 404,
      body: { message: "Not Found" },
    });
    const client = createMattermostClient({
      baseUrl: "http://localhost:8065",
      botToken: "tok",
      fetchImpl: mockFetch,
    });
    await expect(client.request("/missing")).rejects.toThrow("Mattermost API 404");
  });

  it("returns undefined on 204 responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(null, { status: 204 });
    });
    const client = createMattermostClient({
      baseUrl: "https://chat.example.com",
      botToken: "test-token",
      fetchImpl,
    });
    const result = await client.request<unknown>("/anything", { method: "DELETE" });
    expect(result).toBeUndefined();
  });
});

// ── readMattermostError ──────────────────────────────────────────────

describe("readMattermostError", () => {
  it("extracts the message field from a JSON error body", async () => {
    const res = new Response(JSON.stringify({ message: "Not Found", id: "api.404" }), {
      headers: { "content-type": "application/json" },
    });
    await expect(readMattermostError(res)).resolves.toBe("Not Found");
  });

  it("stringifies a JSON error body that carries no message field", async () => {
    const res = new Response(JSON.stringify({ id: "api.404" }), {
      headers: { "content-type": "application/json" },
    });
    await expect(readMattermostError(res)).resolves.toBe('{"id":"api.404"}');
  });

  it("returns raw text for a non-JSON error body", async () => {
    const res = new Response("upstream exploded", {
      headers: { "content-type": "text/plain" },
    });
    await expect(readMattermostError(res)).resolves.toBe("upstream exploded");
  });

  it("falls back to raw text when a JSON-typed body does not parse", async () => {
    const res = new Response("<html>502 Bad Gateway</html>", {
      headers: { "content-type": "application/json" },
    });
    await expect(readMattermostError(res)).resolves.toBe("<html>502 Bad Gateway</html>");
  });

  it("handles a bodyless response", async () => {
    const res = new Response(null, { status: 204, headers: { "content-type": "text/plain" } });
    await expect(readMattermostError(res)).resolves.toBe("");
  });

  it("keeps the pre-existing throw on a bodyless response typed as JSON", async () => {
    // Pins the no-body fast path. `res.json()` on an absent body rejects, exactly as it did before
    // the bounded read landed — routing this case through the bounded branch instead would swallow
    // it into "" via the JSON-parse fallback, which would be a silent behaviour change.
    const res = new Response(null, {
      status: 304,
      headers: { "content-type": "application/json" },
    });
    await expect(readMattermostError(res)).rejects.toThrow(SyntaxError);
  });

  it("caps an oversized error body at 8 KiB", async () => {
    const res = new Response("x".repeat(64 * 1024), {
      headers: { "content-type": "text/plain" },
    });
    const detail = await readMattermostError(res);
    expect(detail).toHaveLength(8 * 1024);
  });

  it("caps an oversized JSON error body and surfaces the truncated text", async () => {
    // A hostile server can pad a JSON body past the cap; the truncated remainder no longer parses,
    // so the raw-text fallback carries the (bounded) detail instead of buffering the whole body.
    const res = new Response(JSON.stringify({ message: "x".repeat(64 * 1024) }), {
      headers: { "content-type": "application/json" },
    });
    const detail = await readMattermostError(res);
    expect(detail).toHaveLength(8 * 1024);
  });

  it("stops reading an unbounded error body instead of draining it", async () => {
    let pulls = 0;
    let cancelled = false;
    const chunk = new TextEncoder().encode("x".repeat(4 * 1024));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 1000) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const res = new Response(stream, { headers: { "content-type": "text/plain" } });

    const detail = await readMattermostError(res);

    expect(detail).toHaveLength(8 * 1024);
    // A handful of 4 KiB pulls to fill the 8 KiB budget — not the endless stream the server
    // offered. Bounded rather than exact: stream queue pre-fill can add one pull depending on
    // microtask timing, and pinning that would test scheduling instead of the read.
    expect(pulls).toBeLessThanOrEqual(4);
    expect(cancelled).toBe(true);
  });
});

// ── createMattermostPost ─────────────────────────────────────────────

describe("createMattermostPost", () => {
  it("sends channel_id and message", async () => {
    const { mockFetch, calls } = createMockFetch({ body: { id: "post1" } });
    const client = createMattermostClient({
      baseUrl: "http://localhost:8065",
      botToken: "tok",
      fetchImpl: mockFetch,
    });

    await createMattermostPost(client, {
      channelId: "ch123",
      message: "Hello world",
    });

    const body = parseRequestJson(calls[0].init);
    expect(body.channel_id).toBe("ch123");
    expect(body.message).toBe("Hello world");
  });

  it("includes rootId when provided", async () => {
    const { mockFetch, calls } = createMockFetch({ body: { id: "post2" } });
    const client = createMattermostClient({
      baseUrl: "http://localhost:8065",
      botToken: "tok",
      fetchImpl: mockFetch,
    });

    await createMattermostPost(client, {
      channelId: "ch123",
      message: "Reply",
      rootId: "root456",
    });

    const body = parseRequestJson(calls[0].init);
    expect(body.root_id).toBe("root456");
  });

  it("includes fileIds when provided", async () => {
    const { mockFetch, calls } = createMockFetch({ body: { id: "post3" } });
    const client = createMattermostClient({
      baseUrl: "http://localhost:8065",
      botToken: "tok",
      fetchImpl: mockFetch,
    });

    await createMattermostPost(client, {
      channelId: "ch123",
      message: "With file",
      fileIds: ["file1", "file2"],
    });

    const body = parseRequestJson(calls[0].init);
    expect(body.file_ids).toEqual(["file1", "file2"]);
  });

  it("includes props when provided (for interactive buttons)", async () => {
    const { mockFetch, calls } = createMockFetch({ body: { id: "post4" } });
    const client = createMattermostClient({
      baseUrl: "http://localhost:8065",
      botToken: "tok",
      fetchImpl: mockFetch,
    });

    const props = {
      attachments: [
        {
          text: "Choose:",
          actions: [{ id: "btn1", type: "button", name: "Click" }],
        },
      ],
    };

    await createMattermostPost(client, {
      channelId: "ch123",
      message: "Pick an option",
      props,
    });

    const body = parseRequestJson(calls[0].init);
    expect(body).toEqual({
      channel_id: "ch123",
      message: "Pick an option",
      props,
    });
  });

  it("omits props when not provided", async () => {
    const { mockFetch, calls } = createMockFetch({ body: { id: "post5" } });
    const client = createMattermostClient({
      baseUrl: "http://localhost:8065",
      botToken: "tok",
      fetchImpl: mockFetch,
    });

    await createMattermostPost(client, {
      channelId: "ch123",
      message: "No props",
    });

    const body = parseRequestJson(calls[0].init);
    expect(body.props).toBeUndefined();
  });
});

// ── updateMattermostPost ─────────────────────────────────────────────

describe("updateMattermostPost", () => {
  it("sends PUT to /posts/{id}", async () => {
    const { calls } = await updatePostAndCapture({ message: "Updated" });

    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error("expected Mattermost update post request");
    }
    expect(firstCall.url).toContain("/posts/post1");
    if (!firstCall.init) {
      throw new Error("expected Mattermost update post request init");
    }
    expect(firstCall.init.method).toBe("PUT");
  });

  it("includes post id in the body", async () => {
    const { body } = await updatePostAndCapture({ message: "Updated" });
    expect(body.id).toBe("post1");
    expect(body.message).toBe("Updated");
  });

  it("includes props for button completion updates", async () => {
    const { body } = await updatePostAndCapture({
      message: "Original message",
      props: {
        attachments: [{ text: "✓ **do_now** selected by @tony" }],
      },
    });
    expect(body).toEqual({
      id: "post1",
      message: "Original message",
      props: {
        attachments: [{ text: "✓ **do_now** selected by @tony" }],
      },
    });
  });

  it("omits message when not provided", async () => {
    const { body } = await updatePostAndCapture({
      props: { attachments: [] },
    });
    expect(body.id).toBe("post1");
    expect(body.message).toBeUndefined();
    expect(body.props).toEqual({ attachments: [] });
  });
});
