import { isHttpUrl } from "@remoteclaw/net-policy/url-protocol";

export function normalizeHttpWebhookUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!isHttpUrl(trimmed)) {
    return null;
  }
  return trimmed;
}
