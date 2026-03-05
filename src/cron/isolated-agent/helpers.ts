import { truncateUtf16Safe } from "../../utils.js";

type DeliveryPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  channelData?: Record<string, unknown>;
};

export function pickSummaryFromOutput(text: string | undefined) {
  const clean = (text ?? "").trim();
  if (!clean) {
    return undefined;
  }
  const limit = 2000;
  return clean.length > limit ? `${truncateUtf16Safe(clean, limit)}…` : clean;
}

export function pickSummaryFromPayloads(payloads: Array<{ text?: string | undefined }>) {
  for (let i = payloads.length - 1; i >= 0; i--) {
    const summary = pickSummaryFromOutput(payloads[i]?.text);
    if (summary) {
      return summary;
    }
  }
  return undefined;
}

export function pickLastNonEmptyTextFromPayloads(payloads: Array<{ text?: string | undefined }>) {
  for (let i = payloads.length - 1; i >= 0; i--) {
    const clean = (payloads[i]?.text ?? "").trim();
    if (clean) {
      return clean;
    }
  }
  return undefined;
}

export function pickLastDeliverablePayload(payloads: DeliveryPayload[]) {
  for (let i = payloads.length - 1; i >= 0; i--) {
    const payload = payloads[i];
    const text = (payload?.text ?? "").trim();
    const hasMedia = Boolean(payload?.mediaUrl) || (payload?.mediaUrls?.length ?? 0) > 0;
    const hasChannelData = Object.keys(payload?.channelData ?? {}).length > 0;
    if (text || hasMedia || hasChannelData) {
      return payload;
    }
  }
  return undefined;
}
