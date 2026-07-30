// Plugin SDK tests cover bounded response-body text reads.
import { describe, expect, it, vi } from "vitest";
import { readResponseTextLimited } from "./response-text-limit.js";

function streamingResponse(
  chunks: Uint8Array[],
  hooks?: { onPull?: (index: number) => void; onCancel?: () => void },
): Response {
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      hooks?.onPull?.(index);
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[index]);
      index += 1;
    },
    cancel() {
      hooks?.onCancel?.();
    },
  });
  return new Response(stream);
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("readResponseTextLimited", () => {
  it("returns the whole body when it fits under the limit", async () => {
    const response = new Response("short error detail");
    await expect(readResponseTextLimited(response, 1024)).resolves.toBe("short error detail");
  });

  it("truncates a body that exceeds the limit", async () => {
    const response = new Response("a".repeat(5000));
    const text = await readResponseTextLimited(response, 100);
    expect(text).toBe("a".repeat(100));
  });

  it("stops reading once the limit is reached instead of draining the body", async () => {
    const onPull = vi.fn();
    const onCancel = vi.fn();
    // 4 chunks of 64 bytes; a 100-byte budget is spent partway through the second.
    const chunks = [
      bytes("a".repeat(64)),
      bytes("b".repeat(64)),
      bytes("c".repeat(64)),
      bytes("d".repeat(64)),
    ];
    const response = streamingResponse(chunks, { onPull, onCancel });

    const text = await readResponseTextLimited(response, 100);

    expect(text).toBe(`${"a".repeat(64)}${"b".repeat(36)}`);
    expect(text).toHaveLength(100);
    // The body was left undrained. Asserted as a bound, not an exact count: a ReadableStream may
    // eagerly pre-fill its queue by one chunk depending on microtask timing, so an exact count
    // would pin scheduling rather than the read behaviour under test.
    expect(onPull.mock.calls.length).toBeLessThan(chunks.length);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("returns an empty string for a non-positive limit and leaves the body unconsumed", async () => {
    const response = new Response("payload");
    await expect(readResponseTextLimited(response, 0)).resolves.toBe("");
    await expect(readResponseTextLimited(new Response("payload"), -1)).resolves.toBe("");
    // The reader was never acquired, so the body is still intact for another consumer.
    expect(response.bodyUsed).toBe(false);
    await expect(response.text()).resolves.toBe("payload");
  });

  it("returns an empty string when the response has no body", async () => {
    const response = new Response(null, { status: 204 });
    await expect(readResponseTextLimited(response, 1024)).resolves.toBe("");
  });

  it("skips empty chunks without spending budget", async () => {
    const response = streamingResponse([bytes(""), bytes("detail"), bytes("")]);
    await expect(readResponseTextLimited(response, 1024)).resolves.toBe("detail");
  });

  it("decodes multi-byte characters split across chunks", async () => {
    // "é" is 2 bytes in UTF-8; split it so each chunk holds half.
    const encoded = bytes("é");
    const response = streamingResponse([encoded.subarray(0, 1), encoded.subarray(1)]);
    await expect(readResponseTextLimited(response, 1024)).resolves.toBe("é");
  });

  it("flushes a multi-byte character truncated by the limit", async () => {
    // "ab é" is 5 UTF-8 bytes; a 4-byte budget cuts "é" in half, and the decoder flush emits a
    // replacement char rather than dropping the partial sequence.
    const response = new Response("ab é");
    const text = await readResponseTextLimited(response, 4);
    expect(text).toBe("ab �");
  });

  it("defaults to a 16 KiB budget", async () => {
    const response = new Response("a".repeat(32 * 1024));
    const text = await readResponseTextLimited(response);
    expect(text).toHaveLength(16 * 1024);
  });
});
