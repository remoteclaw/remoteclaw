import type { ReplyPayload } from "../auto-reply/types.js";
import { logDebug } from "../logger.js";
import type { AgentEvent, BridgeCallbacks } from "./types.js";

/** Options for the delivery adapter. */
export type DeliveryAdapterOptions = {
  /**
   * Maximum characters per message chunk.
   * Different channels have different limits:
   * - Discord: 2000 chars
   * - Telegram: 4096 chars
   * - Slack: ~40000 chars (block-based)
   * Default: 4000 (safe default for most channels)
   */
  chunkLimit?: number | undefined;
};

const DEFAULT_CHUNK_LIMIT = 4000;

/**
 * Converts AgentEvent async iterable into channel-deliverable ReplyPayload chunks.
 *
 * Handles:
 * - Text accumulation and chunking at channel limits
 * - Progressive streaming via BridgeCallbacks
 * - Tool result formatting
 * - Error event formatting
 */
export class DeliveryAdapter {
  private readonly chunkLimit: number;

  constructor(options?: DeliveryAdapterOptions) {
    this.chunkLimit = options?.chunkLimit ?? DEFAULT_CHUNK_LIMIT;
  }

  /**
   * Process an event stream, invoking callbacks for real-time delivery
   * and returning final payloads for post-execution delivery.
   *
   * @param events - AgentEvent async iterable from runtime.execute()
   * @param callbacks - Optional streaming callbacks for real-time delivery
   * @returns Final ReplyPayload array for post-execution delivery
   */
  async process(
    events: AsyncIterable<AgentEvent>,
    callbacks?: BridgeCallbacks,
  ): Promise<ReplyPayload[]> {
    let textBuffer = "";
    const payloads: ReplyPayload[] = [];
    /** Track media delivered via streaming events to avoid duplicates from result.media. */
    const deliveredMediaKeys = new Set<string>();
    let eventCount = 0;

    for await (const event of events) {
      eventCount++;
      switch (event.type) {
        case "text": {
          if (event.text === "") {
            break;
          }
          textBuffer += event.text;
          while (textBuffer.length > this.chunkLimit) {
            const { chunk, rest } = splitAtBoundary(textBuffer, this.chunkLimit);
            textBuffer = rest;
            const payload: ReplyPayload = { text: chunk };
            payloads.push(payload);
            await callbacks?.onPartialReply?.(payload);
          }
          break;
        }
        case "media": {
          const mediaUrl = event.media.filePath ?? event.media.sourceUrl;
          if (mediaUrl) {
            // Flush any buffered text before the media so ordering is preserved.
            if (textBuffer.length > 0) {
              const textPayload: ReplyPayload = { text: textBuffer };
              payloads.push(textPayload);
              await callbacks?.onBlockReply?.(textPayload);
              textBuffer = "";
            }
            deliveredMediaKeys.add(mediaUrl);
            const payload: ReplyPayload = { mediaUrl };
            payloads.push(payload);
            await callbacks?.onBlockReply?.(payload);
          }
          break;
        }
        case "thinking": {
          if (event.text) {
            callbacks?.onThinking?.({ text: event.text });
          }
          break;
        }
        case "tool_use":
          break;
        case "tool_result": {
          const formatted = formatToolResult(event.toolId, event.output, event.isError);
          const payload: ReplyPayload = { text: formatted };
          await callbacks?.onToolResult?.(payload);
          break;
        }
        case "error": {
          const errorMsg = event.code ? `[${event.code}] ${event.message}` : event.message;
          const payload: ReplyPayload = { text: errorMsg, isError: true };
          payloads.push(payload);
          await callbacks?.onBlockReply?.(payload);
          break;
        }
        case "done": {
          if (textBuffer.length > 0) {
            const payload: ReplyPayload = { text: textBuffer };
            payloads.push(payload);
            await callbacks?.onBlockReply?.(payload);
            textBuffer = "";
          }
          // Deliver result media not already delivered via streaming events.
          if (event.result.media?.length) {
            for (const media of event.result.media) {
              const url = media.filePath ?? media.sourceUrl;
              if (url && !deliveredMediaKeys.has(url)) {
                const payload: ReplyPayload = { mediaUrl: url };
                payloads.push(payload);
                await callbacks?.onBlockReply?.(payload);
              }
            }
          }
          break;
        }
      }
    }

    // Flush any remaining text if stream ends without a done event
    if (textBuffer.length > 0) {
      const payload: ReplyPayload = { text: textBuffer };
      payloads.push(payload);
    }

    logDebug(
      `[delivery-adapter] processed ${eventCount} events into ${payloads.length} payloads (chunkLimit=${this.chunkLimit})`,
    );
    return payloads;
  }
}

/** Format a tool result for display. */
function formatToolResult(toolId: string, output: string, isError?: boolean): string {
  const prefix = isError ? `Tool ${toolId} error` : `Tool ${toolId} result`;
  return `${prefix}: ${output}`;
}

/**
 * Split text at the nearest safe boundary before the limit.
 *
 * Preference order:
 * 1. Paragraph break (\n\n)
 * 2. Line break (\n)
 * 3. Word boundary (space)
 * 4. Hard split at limit
 *
 * Markdown-aware: preserves code fence boundaries by closing/reopening
 * fences at split points when a split occurs inside a fenced code block.
 */
function splitAtBoundary(text: string, limit: number): { chunk: string; rest: string } {
  // Check if we're inside a code fence at the split region
  const fenceInfo = findOpenCodeFence(text, limit);

  if (fenceInfo !== undefined) {
    // Split before the code fence starts if possible
    const beforeFence = text.substring(0, fenceInfo.fenceStart);
    if (beforeFence.trimEnd().length > 0) {
      const trimmed = beforeFence.trimEnd();
      return { chunk: trimmed, rest: text.substring(trimmed.length).trimStart() };
    }
    // Code fence starts at the beginning — close fence at limit and reopen in next chunk
    const closingFence = `\n${fenceInfo.fence}`;
    const openingFence = `${fenceInfo.fence}\n`;
    const splitPoint = findSplitPoint(text, limit - closingFence.length);
    return {
      chunk: text.substring(0, splitPoint) + closingFence,
      rest: openingFence + text.substring(splitPoint),
    };
  }

  const splitPoint = findSplitPoint(text, limit);
  return {
    chunk: text.substring(0, splitPoint),
    rest: text.substring(splitPoint),
  };
}

/** Find the best split point within the text up to the given limit. */
function findSplitPoint(text: string, limit: number): number {
  if (limit <= 0) {
    return Math.min(1, text.length);
  }

  const searchRegion = text.substring(0, limit);

  // 1. Paragraph break (\n\n)
  const paragraphIdx = searchRegion.lastIndexOf("\n\n");
  if (paragraphIdx > 0) {
    return paragraphIdx + 2;
  }

  // 2. Line break (\n)
  const lineIdx = searchRegion.lastIndexOf("\n");
  if (lineIdx > 0) {
    return lineIdx + 1;
  }

  // 3. Word boundary (space)
  const spaceIdx = searchRegion.lastIndexOf(" ");
  if (spaceIdx > 0) {
    return spaceIdx + 1;
  }

  // 4. Hard split at limit
  return limit;
}

/**
 * Detect if the text has an unclosed code fence at or before the limit position.
 * Returns info about the open fence, or undefined if no open fence.
 */
function findOpenCodeFence(
  text: string,
  limit: number,
): { fenceStart: number; fence: string } | undefined {
  const fenceRegex = /^(`{3,}|~{3,})/gm;
  let openFence: { fenceStart: number; fence: string } | undefined;

  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    if (match.index >= limit) {
      break;
    }
    if (openFence === undefined) {
      openFence = { fenceStart: match.index, fence: match[1] };
    } else {
      // Closing fence found — only if fence marker matches
      if (
        match[1].charAt(0) === openFence.fence.charAt(0) &&
        match[1].length >= openFence.fence.length
      ) {
        openFence = undefined;
      }
    }
  }

  return openFence;
}
