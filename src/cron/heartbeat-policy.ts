/** Decides when cron heartbeat acknowledgements should stay out of visible delivery. */
import { hasOutboundReplyContent } from "remoteclaw/plugin-sdk/reply-payload";
import { stripHeartbeatToken } from "../auto-reply/heartbeat.js";

type HeartbeatDeliveryPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  presentation?: unknown;
  interactive?: unknown;
  channelData?: unknown;
};

export function shouldSkipHeartbeatOnlyDelivery(
  payloads: HeartbeatDeliveryPayload[],
  ackMaxChars: number,
): boolean {
  if (payloads.length === 0) {
    return true;
  }
  const hasAnyNonTextContent = payloads.some((payload) =>
    hasOutboundReplyContent({ ...payload, text: undefined }, { trimText: true }),
  );
  if (hasAnyNonTextContent) {
    return false;
  }
  // Heartbeat acks may include tiny punctuation/noise; strip the token before
  // deciding whether there is user-visible text worth delivering.
  return payloads.some((payload) => {
    const result = stripHeartbeatToken(payload.text, {
      mode: "heartbeat",
      maxAckChars: ackMaxChars,
    });
    return result.shouldSkip;
  });
}

export function shouldEnqueueCronMainSummary(params: {
  summaryText: string | undefined;
  deliveryRequested: boolean;
  delivered: boolean | undefined;
  deliveryAttempted: boolean | undefined;
  suppressMainSummary: boolean;
  isCronSystemEvent: (text: string) => boolean;
}): boolean {
  const summaryText = params.summaryText?.trim();
  return Boolean(
    summaryText &&
    params.isCronSystemEvent(summaryText) &&
    params.deliveryRequested &&
    !params.delivered &&
    params.deliveryAttempted !== true &&
    !params.suppressMainSummary,
  );
}
