export function hasLegacyDeliveryHints(_payload: Record<string, unknown>) {
  return false;
}

export function buildDeliveryFromLegacyPayload(
  _payload: Record<string, unknown>,
): Record<string, unknown> {
  return {};
}

export function stripLegacyDeliveryFields(_payload: Record<string, unknown>) {}
