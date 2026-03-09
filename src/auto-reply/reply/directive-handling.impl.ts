import { updateSessionStore } from "../../config/sessions.js";
import { applyVerboseOverride } from "../../sessions/level-overrides.js";
import type { ReplyPayload } from "../types.js";
import type { HandleDirectiveOnlyParams } from "./directive-handling.params.js";
import { maybeHandleQueueDirective } from "./directive-handling.queue-validation.js";
import { formatDirectiveAck, withOptions } from "./directive-handling.shared.js";

export async function handleDirectiveOnly(
  params: HandleDirectiveOnlyParams,
): Promise<ReplyPayload | undefined> {
  const { directives, sessionEntry, sessionStore, sessionKey, storePath, currentVerboseLevel } =
    params;

  if (directives.hasVerboseDirective && !directives.verboseLevel) {
    if (!directives.rawVerboseLevel) {
      const level = currentVerboseLevel ?? "off";
      return {
        text: withOptions(`Current verbose level: ${level}.`, "on, full, off"),
      };
    }
    return {
      text: `Unrecognized verbose level "${directives.rawVerboseLevel}". Valid levels: off, on, full.`,
    };
  }

  const queueAck = maybeHandleQueueDirective({
    directives,
    cfg: params.cfg,
    channel: params.provider,
    sessionEntry,
  });
  if (queueAck) {
    return queueAck;
  }

  if (directives.hasVerboseDirective && directives.verboseLevel) {
    applyVerboseOverride(sessionEntry, directives.verboseLevel);
  }
  if (directives.hasQueueDirective && directives.queueReset) {
    delete sessionEntry.queueMode;
    delete sessionEntry.queueDebounceMs;
    delete sessionEntry.queueCap;
    delete sessionEntry.queueDrop;
  } else if (directives.hasQueueDirective) {
    if (directives.queueMode) {
      sessionEntry.queueMode = directives.queueMode;
    }
    if (typeof directives.debounceMs === "number") {
      sessionEntry.queueDebounceMs = directives.debounceMs;
    }
    if (typeof directives.cap === "number") {
      sessionEntry.queueCap = directives.cap;
    }
    if (directives.dropPolicy) {
      sessionEntry.queueDrop = directives.dropPolicy;
    }
  }
  sessionEntry.updatedAt = Date.now();
  sessionStore[sessionKey] = sessionEntry;
  if (storePath) {
    await updateSessionStore(storePath, (store) => {
      store[sessionKey] = sessionEntry;
    });
  }
  const parts: string[] = [];
  if (directives.hasVerboseDirective && directives.verboseLevel) {
    parts.push(
      directives.verboseLevel === "off"
        ? formatDirectiveAck("Verbose logging disabled.")
        : directives.verboseLevel === "full"
          ? formatDirectiveAck("Verbose logging set to full.")
          : formatDirectiveAck("Verbose logging enabled."),
    );
  }
  if (directives.hasQueueDirective && directives.queueMode) {
    parts.push(formatDirectiveAck(`Queue mode set to ${directives.queueMode}.`));
  } else if (directives.hasQueueDirective && directives.queueReset) {
    parts.push(formatDirectiveAck("Queue mode reset to default."));
  }
  if (directives.hasQueueDirective && typeof directives.debounceMs === "number") {
    parts.push(formatDirectiveAck(`Queue debounce set to ${directives.debounceMs}ms.`));
  }
  if (directives.hasQueueDirective && typeof directives.cap === "number") {
    parts.push(formatDirectiveAck(`Queue cap set to ${directives.cap}.`));
  }
  if (directives.hasQueueDirective && directives.dropPolicy) {
    parts.push(formatDirectiveAck(`Queue drop set to ${directives.dropPolicy}.`));
  }
  const ack = parts.join(" ").trim();
  if (!ack && directives.hasStatusDirective) {
    return undefined;
  }
  return { text: ack || "OK." };
}
