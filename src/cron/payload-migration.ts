type UnknownRecord = Record<string, unknown>;

export function migrateLegacyCronPayload(_payload: UnknownRecord): boolean {
  return false;
}
