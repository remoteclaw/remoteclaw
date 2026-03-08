import { describe, expect, it, vi } from "vitest";
import type { ReplyPayload } from "../auto-reply/types.js";
import { DeliveryAdapter } from "./delivery-adapter.js";
import type { AgentEvent, BridgeCallbacks } from "./types.js";

/** Create an async iterable from an array of events. */
async function* eventStream(events: AgentEvent[]): AsyncIterable<AgentEvent> {
  for (const event of events) {
    yield event;
  }
}

/** Create a done event with minimal defaults. */
function makeDone(): AgentEvent {
  return {
    type: "done",
    result: {
      text: "",
      sessionId: undefined,
      durationMs: 0,
      usage: undefined,
      aborted: false,
    },
  };
}

describe("DeliveryAdapter", () => {
  describe("text accumulation", () => {
    it("produces single payload from single text event", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([{ type: "text", text: "Hello world" }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ text: "Hello world" }]);
    });

    it("accumulates multiple text events into one payload", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        { type: "text", text: "Hello " },
        { type: "text", text: "world" },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ text: "Hello world" }]);
    });

    it("skips empty text events", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        { type: "text", text: "Hello" },
        { type: "text", text: "" },
        { type: "text", text: " world" },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ text: "Hello world" }]);
    });

    it("returns empty array when no text events", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([]);
    });
  });

  describe("message splitting", () => {
    it("splits text exceeding chunkLimit into multiple chunks", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 20 });
      const events = eventStream([
        { type: "text", text: "Hello world. This is a longer message that exceeds the limit." },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads.length).toBeGreaterThan(1);
      for (const p of payloads) {
        expect(p.text).toBeDefined();
      }
    });

    it("splits at paragraph boundary when possible", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 30 });
      const text = "First paragraph.\n\nSecond paragraph here.";
      const events = eventStream([{ type: "text", text }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads.length).toBe(2);
      expect(payloads[0].text).toBe("First paragraph.\n\n");
      expect(payloads[1].text).toBe("Second paragraph here.");
    });

    it("splits at line boundary as fallback", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 20 });
      const text = "First line here.\nSecond line here.";
      const events = eventStream([{ type: "text", text }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads.length).toBe(2);
      expect(payloads[0].text).toBe("First line here.\n");
      expect(payloads[1].text).toBe("Second line here.");
    });

    it("splits at word boundary as last resort before hard split", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 10 });
      const text = "Hello beautiful world";
      const events = eventStream([{ type: "text", text }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads.length).toBeGreaterThanOrEqual(2);
      // First chunk should break at a space
      expect(payloads[0].text).toMatch(/ $/);
    });

    it("hard splits when no natural boundary exists", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 5 });
      const text = "abcdefghij";
      const events = eventStream([{ type: "text", text }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads.length).toBe(2);
      expect(payloads[0].text).toBe("abcde");
      expect(payloads[1].text).toBe("fghij");
    });

    it("does not split text exactly at chunk limit", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 11 });
      const events = eventStream([{ type: "text", text: "Hello world" }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ text: "Hello world" }]);
    });

    it("preserves all text content when splitting", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 15 });
      const original = "The quick brown fox jumps over the lazy dog.";
      const events = eventStream([{ type: "text", text: original }, makeDone()]);
      const payloads = await adapter.process(events);
      const reassembled = payloads.map((p) => p.text).join("");
      expect(reassembled).toBe(original);
    });
  });

  describe("streaming callbacks", () => {
    it("calls onPartialReply when buffer flushed mid-stream", async () => {
      const onPartialReply = vi.fn();
      const adapter = new DeliveryAdapter({ chunkLimit: 10 });
      const events = eventStream([
        { type: "text", text: "Hello world, this is a long message" },
        makeDone(),
      ]);
      await adapter.process(events, { onPartialReply });
      expect(onPartialReply).toHaveBeenCalled();
      for (const call of onPartialReply.mock.calls) {
        expect(call[0]).toHaveProperty("text");
      }
    });

    it("calls onBlockReply for error events", async () => {
      const onBlockReply = vi.fn();
      const adapter = new DeliveryAdapter();
      const events = eventStream([{ type: "error", message: "Something failed" }, makeDone()]);
      await adapter.process(events, { onBlockReply });
      expect(onBlockReply).toHaveBeenCalledWith({ text: "Something failed", isError: true });
    });

    it("calls onBlockReply for final text flush on done", async () => {
      const onBlockReply = vi.fn();
      const adapter = new DeliveryAdapter();
      const events = eventStream([{ type: "text", text: "Final text" }, makeDone()]);
      await adapter.process(events, { onBlockReply });
      expect(onBlockReply).toHaveBeenCalledWith({ text: "Final text" });
    });

    it("calls onToolResult for tool result events", async () => {
      const onToolResult = vi.fn();
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        { type: "tool_result", toolId: "t1", output: "result data" },
        makeDone(),
      ]);
      await adapter.process(events, { onToolResult });
      expect(onToolResult).toHaveBeenCalledWith({ text: "Tool t1 result: result data" });
    });

    it("does not error when callbacks are omitted", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 10 });
      const events = eventStream([
        { type: "text", text: "Hello world, this is a long message" },
        { type: "tool_result", toolId: "t1", output: "data" },
        { type: "error", message: "oops" },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads.length).toBeGreaterThan(0);
    });

    it("handles async callbacks", async () => {
      const calls: string[] = [];
      const callbacks: BridgeCallbacks = {
        onPartialReply: async (p) => {
          await new Promise((r) => setTimeout(r, 1));
          calls.push(`partial:${p.text}`);
        },
        onBlockReply: async (p) => {
          await new Promise((r) => setTimeout(r, 1));
          calls.push(`block:${p.text}`);
        },
      };
      const adapter = new DeliveryAdapter({ chunkLimit: 10 });
      const events = eventStream([{ type: "text", text: "Hello world, done" }, makeDone()]);
      await adapter.process(events, callbacks);
      expect(calls.some((c) => c.startsWith("partial:"))).toBe(true);
      expect(calls.some((c) => c.startsWith("block:"))).toBe(true);
    });
  });

  describe("event types", () => {
    it("tool_use events produce no output", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        {
          type: "tool_use",
          toolName: "read_file",
          toolId: "t1",
          input: { path: "/tmp/test" },
        },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([]);
    });

    it("tool_result events produce formatted payload via onToolResult", async () => {
      const onToolResult = vi.fn();
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        { type: "tool_result", toolId: "t1", output: "file contents here" },
        makeDone(),
      ]);
      await adapter.process(events, { onToolResult });
      expect(onToolResult).toHaveBeenCalledWith({
        text: "Tool t1 result: file contents here",
      });
    });

    it("tool_result with isError formats as error", async () => {
      const onToolResult = vi.fn();
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        { type: "tool_result", toolId: "t1", output: "permission denied", isError: true },
        makeDone(),
      ]);
      await adapter.process(events, { onToolResult });
      expect(onToolResult).toHaveBeenCalledWith({
        text: "Tool t1 error: permission denied",
      });
    });

    it("error events produce error payload with isError true", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([{ type: "error", message: "Critical failure" }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ text: "Critical failure", isError: true }]);
    });

    it("error events with code include code in message", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        { type: "error", message: "Rate limit exceeded", code: "RATE_LIMIT" },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ text: "[RATE_LIMIT] Rate limit exceeded", isError: true }]);
    });

    it("done event flushes remaining buffer", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([{ type: "text", text: "buffered text" }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ text: "buffered text" }]);
    });

    it("only error events when no text → returns error payloads", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        { type: "error", message: "error one" },
        { type: "error", message: "error two" },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([
        { text: "error one", isError: true },
        { text: "error two", isError: true },
      ]);
    });
  });

  describe("media events", () => {
    it("media event with filePath produces mediaUrl payload", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        {
          type: "media" as const,
          media: { mimeType: "image/png", filePath: "/tmp/screenshot.png" },
        },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ mediaUrl: "/tmp/screenshot.png" }]);
    });

    it("media event with sourceUrl produces mediaUrl payload when no filePath", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        {
          type: "media" as const,
          media: { mimeType: "image/jpeg", sourceUrl: "https://example.com/photo.jpg" },
        },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ mediaUrl: "https://example.com/photo.jpg" }]);
    });

    it("media event prefers filePath over sourceUrl", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        {
          type: "media" as const,
          media: {
            mimeType: "image/png",
            filePath: "/tmp/local.png",
            sourceUrl: "https://example.com/remote.png",
          },
        },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ mediaUrl: "/tmp/local.png" }]);
    });

    it("media event with neither filePath nor sourceUrl is skipped", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        {
          type: "media" as const,
          media: { mimeType: "image/png", base64: "aW1hZ2VkYXRh" },
        },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([]);
    });

    it("media event invokes onBlockReply callback", async () => {
      const onBlockReply = vi.fn();
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        {
          type: "media" as const,
          media: { mimeType: "audio/ogg", filePath: "/tmp/voice.ogg" },
        },
        makeDone(),
      ]);
      await adapter.process(events, { onBlockReply });
      expect(onBlockReply).toHaveBeenCalledWith({ mediaUrl: "/tmp/voice.ogg" });
    });

    it("interleaves text and media payloads in order", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        { type: "text", text: "Here is the file:" },
        {
          type: "media" as const,
          media: { mimeType: "image/png", filePath: "/tmp/chart.png" },
        },
        makeDone(),
      ]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ text: "Here is the file:" }, { mediaUrl: "/tmp/chart.png" }]);
    });

    it("delivers result.media from done event when not already streamed", async () => {
      const adapter = new DeliveryAdapter();
      const doneEvent: AgentEvent = {
        type: "done",
        result: {
          text: "Done",
          sessionId: undefined,
          durationMs: 100,
          usage: undefined,
          aborted: false,
          media: [
            { mimeType: "image/png", filePath: "/tmp/result.png" },
            { mimeType: "audio/mp3", sourceUrl: "https://example.com/audio.mp3" },
          ],
        },
      };
      const events = eventStream([{ type: "text", text: "Done" }, doneEvent]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([
        { text: "Done" },
        { mediaUrl: "/tmp/result.png" },
        { mediaUrl: "https://example.com/audio.mp3" },
      ]);
    });

    it("deduplicates streamed media vs result.media", async () => {
      const adapter = new DeliveryAdapter();
      const doneEvent: AgentEvent = {
        type: "done",
        result: {
          text: "",
          sessionId: undefined,
          durationMs: 100,
          usage: undefined,
          aborted: false,
          media: [
            { mimeType: "image/png", filePath: "/tmp/already-sent.png" },
            { mimeType: "image/jpeg", filePath: "/tmp/new.jpg" },
          ],
        },
      };
      const events = eventStream([
        {
          type: "media" as const,
          media: { mimeType: "image/png", filePath: "/tmp/already-sent.png" },
        },
        doneEvent,
      ]);
      const payloads = await adapter.process(events);
      // /tmp/already-sent.png should appear only once (from streaming), /tmp/new.jpg from result
      expect(payloads).toEqual([
        { mediaUrl: "/tmp/already-sent.png" },
        { mediaUrl: "/tmp/new.jpg" },
      ]);
    });
  });

  describe("code fence preservation", () => {
    it("does not split inside a code fence when text before fence exists", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 30 });
      const text = "Some text here.\n\n```\ncode line\n```";
      const events = eventStream([{ type: "text", text }, makeDone()]);
      const payloads = await adapter.process(events);
      // The code fence should not be split
      const allText = payloads.map((p) => p.text).join("");
      // Verify all code content is preserved
      expect(allText).toContain("code line");
      expect(allText).toContain("```");
    });

    it("closes and reopens fence when split is necessary inside code block", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 25 });
      const text = "```\nline one\nline two\nline three\nline four\n```";
      const events = eventStream([{ type: "text", text }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads.length).toBeGreaterThan(1);
      // First chunk should end with closing fence
      expect(payloads[0].text).toMatch(/```\s*$/);
      // Second chunk should start with opening fence
      expect(payloads[1].text).toMatch(/^```/);
    });

    it("handles tilde fences", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 25 });
      const text = "~~~\nline one\nline two\nline three\nline four\n~~~";
      const events = eventStream([{ type: "text", text }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads.length).toBeGreaterThan(1);
      expect(payloads[0].text).toMatch(/~~~\s*$/);
      expect(payloads[1].text).toMatch(/^~~~/);
    });

    it("does not treat closed code fences as open", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 40 });
      const text = "```\nshort\n```\n\nNormal text that goes on for a while after the fence.";
      const events = eventStream([{ type: "text", text }, makeDone()]);
      const payloads = await adapter.process(events);
      // The closed fence should not affect splitting behavior
      expect(payloads.length).toBeGreaterThanOrEqual(1);
      const allText = payloads.map((p) => p.text).join("");
      expect(allText).toContain("short");
      expect(allText).toContain("Normal text");
    });
  });

  describe("integration pattern", () => {
    it("processes a realistic event sequence", async () => {
      const partialReplies: ReplyPayload[] = [];
      const blockReplies: ReplyPayload[] = [];
      const toolResults: ReplyPayload[] = [];

      const callbacks: BridgeCallbacks = {
        onPartialReply: (p) => {
          partialReplies.push(p);
        },
        onBlockReply: (p) => {
          blockReplies.push(p);
        },
        onToolResult: (p) => {
          toolResults.push(p);
        },
      };

      const adapter = new DeliveryAdapter({ chunkLimit: 50 });
      const events = eventStream([
        { type: "text", text: "I'll read the file for you.\n\n" },
        {
          type: "tool_use",
          toolName: "read_file",
          toolId: "tool_1",
          input: { path: "test.ts" },
        },
        { type: "tool_result", toolId: "tool_1", output: "file contents" },
        { type: "text", text: "Here is the file content. " },
        { type: "text", text: "The file contains test code that verifies the behavior." },
        makeDone(),
      ]);

      const payloads = await adapter.process(events, callbacks);

      // Tool result callback fired
      expect(toolResults).toHaveLength(1);
      expect(toolResults[0].text).toBe("Tool tool_1 result: file contents");

      // Text was accumulated and delivered
      expect(payloads.length).toBeGreaterThanOrEqual(1);
      const allText = payloads.map((p) => p.text).join("");
      expect(allText).toContain("I'll read the file for you.");
      expect(allText).toContain("The file contains test code");

      // Block reply called at least for final flush
      expect(blockReplies.length).toBeGreaterThanOrEqual(1);
    });

    it("handles stream ending without done event", async () => {
      const adapter = new DeliveryAdapter();
      const events = eventStream([
        { type: "text", text: "Some text" },
        // No done event
      ]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ text: "Some text" }]);
    });

    it("handles very long single text event", async () => {
      const adapter = new DeliveryAdapter({ chunkLimit: 20 });
      const longText = "a".repeat(100);
      const events = eventStream([{ type: "text", text: longText }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads.length).toBe(5);
      for (const p of payloads) {
        expect(p.text!.length).toBeLessThanOrEqual(20);
      }
      const reassembled = payloads.map((p) => p.text).join("");
      expect(reassembled).toBe(longText);
    });
  });

  describe("default chunk limit", () => {
    it("uses 4000 as default chunk limit", async () => {
      const adapter = new DeliveryAdapter();
      const text = "a".repeat(4000);
      const events = eventStream([{ type: "text", text }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads).toEqual([{ text }]);
    });

    it("splits text exceeding 4000 chars with default limit", async () => {
      const adapter = new DeliveryAdapter();
      const text = "a".repeat(4001);
      const events = eventStream([{ type: "text", text }, makeDone()]);
      const payloads = await adapter.process(events);
      expect(payloads.length).toBe(2);
    });
  });
});
