import type { ChannelMessageActionName } from "../../channels/plugins/types.js";
import { loadConfig } from "../../config/config.js";
import { runMessageAction } from "../../infra/outbound/message-action-runner.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";

// ── Method → action mapping ─────────────────────────────────────────────

type MethodMapping = {
  action: ChannelMessageActionName;
  /** Optional param remapping applied before calling runMessageAction. */
  mapParams?: (params: Record<string, unknown>) => Record<string, unknown>;
};

/**
 * Maps each `message:*` gateway method to a `ChannelMessageActionName` and
 * optional parameter transformations.
 *
 * Design rationale (Option B from #139):
 *   - Per-action gateway methods match the existing MCP handler code.
 *   - No MCP handler changes needed — each handler already calls the
 *     correct `message:*` method.
 *
 * Reply and thread-reply are mapped to action "send" (with replyTo /
 * threadId in params) because `handleSendAction` in the message-action-runner
 * has native support for these, making it the most reliable path.
 *
 * sendAttachment is also mapped to "send" with media params.
 */
const METHOD_MAP: Record<string, MethodMapping> = {
  "message:send": { action: "send" },

  "message:reply": {
    action: "send",
    mapParams: (p) => {
      const mapped = { ...p };
      if (mapped.replyToId !== undefined) {
        mapped.replyTo = mapped.replyToId;
        delete mapped.replyToId;
      }
      return mapped;
    },
  },

  "message:thread-reply": {
    action: "send",
    // threadId passes through directly — handleSendAction reads it.
  },

  "message:broadcast": { action: "broadcast" },

  "message:react": { action: "react" },

  "message:delete": { action: "delete" },

  "message:sendAttachment": {
    action: "send",
    mapParams: (p) => {
      const mapped = { ...p };
      if (mapped.file !== undefined) {
        mapped.media = mapped.file;
        delete mapped.file;
      }
      // Use caption as message fallback when message is absent.
      if (!mapped.message && mapped.caption !== undefined) {
        mapped.message = mapped.caption;
      }
      return mapped;
    },
  },

  "message:sendWithEffect": { action: "sendWithEffect" },

  "message:pin": { action: "pin" },

  "message:readMessages": { action: "read" },
};

// ── Shared handler ──────────────────────────────────────────────────────

async function handleMessageMethod(
  method: string,
  params: Record<string, unknown>,
  respond: RespondFn,
): Promise<void> {
  const mapping = METHOD_MAP[method];
  if (!mapping) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `unknown message method: ${method}`),
    );
    return;
  }

  const cfg = loadConfig();
  const actionParams = mapping.mapParams ? mapping.mapParams({ ...params }) : { ...params };

  try {
    const result = await runMessageAction({
      cfg,
      action: mapping.action,
      params: actionParams,
    });
    respond(true, result);
  } catch (err) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.UNAVAILABLE, err instanceof Error ? err.message : String(err)),
    );
  }
}

// ── Exported handlers ───────────────────────────────────────────────────

export const messageHandlers: GatewayRequestHandlers = Object.fromEntries(
  Object.keys(METHOD_MAP).map((method) => [
    method,
    async ({ params, respond }: { params: Record<string, unknown>; respond: RespondFn }) => {
      await handleMessageMethod(method, params, respond);
    },
  ]),
);
