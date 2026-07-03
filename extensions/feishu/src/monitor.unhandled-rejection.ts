import { registerUnhandledRejectionHandler } from "remoteclaw/plugin-sdk/feishu";

/**
 * True when an unhandled rejection originated inside the vendored Lark SDK
 * (`@larksuiteoapi/node-sdk`).
 *
 * The SDK's `WSClient` message handler (`communicate()` registers
 * `wsInstance.on("message", async …)`) runs three un-`.catch()`'d async steps —
 * `decode(buffer)` (protobuf frame decode), `handleControlData` (`JSON.parse` of
 * a pong payload) and `handleEventData` — before the only SDK-guarded call
 * (`eventDispatcher.invoke`). A malformed inbound frame therefore rejects
 * uncaught; the central handler classifies the resulting `RangeError` /
 * `SyntaxError` as non-transient and calls `process.exit(1)`, taking down every
 * channel — not just Feishu.
 *
 * A synchronous throw inside the SDK's bundled `index.js` always carries the
 * package path in its V8 stack, so matching that path scopes suppression to
 * SDK-origin rejections while a Feishu WebSocket connection is active. Any
 * non-SDK rejection still reaches the fatal path unchanged.
 */
export function isFeishuSdkUnhandledRejection(reason: unknown): boolean {
  return (
    reason instanceof Error &&
    typeof reason.stack === "string" &&
    reason.stack.includes("@larksuiteoapi/node-sdk")
  );
}

/**
 * Register a process-level guard that turns an SDK-origin unhandled rejection (a
 * malformed Feishu WebSocket frame) into a logged, dropped frame instead of a
 * gateway crash. The reject site lives inside the vendored SDK's `'message'`
 * listener and cannot be `.catch()`'d directly, so this mirrors the
 * channel-scoped guards used by Slack/Discord/Telegram/WhatsApp.
 *
 * Returns an unregister function; call it when the connection is torn down so the
 * guard's lifetime matches an active WebSocket connection.
 */
export function registerFeishuWsUnhandledRejectionGuard(
  accountId: string,
  error: (message: string) => void,
): () => void {
  return registerUnhandledRejectionHandler((reason) => {
    if (!isFeishuSdkUnhandledRejection(reason)) {
      return false;
    }
    error(`feishu[${accountId}]: dropped malformed WebSocket frame (non-fatal): ${String(reason)}`);
    return true;
  });
}
