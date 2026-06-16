export type DeviceAuthPayloadParams = {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce: string;
};

export type DeviceAuthPayloadV3Params = DeviceAuthPayloadParams & {
  platform?: string | null;
  deviceFamily?: string | null;
};

export function buildDeviceAuthPayload(params: DeviceAuthPayloadParams): string {
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  return [
    "v2",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
  ].join("|");
}

// Normalizes platform/deviceFamily metadata embedded in the signed v3 device-auth
// payload. This MUST stay deterministic across runtimes (TS / Swift / Kotlin):
// the native clients sign over the normalized value and the gateway verifies by
// rebuilding the payload, so both sides have to agree byte-for-byte. Only ASCII
// A-Z is lowercased — JS `String.toLowerCase()` is locale/Unicode-aware (e.g. it
// maps "İ" to "i̇", a combining sequence) which would diverge from the native
// clients' ASCII-only lowering and break Ed25519 verification for those devices.
export function normalizeDeviceMetadataForAuth(value: string | null | undefined): string {
  if (!value || typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  let out = "";
  for (const ch of trimmed) {
    const code = ch.charCodeAt(0);
    out += code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 32) : ch;
  }
  return out;
}

export function buildDeviceAuthPayloadV3(params: DeviceAuthPayloadV3Params): string {
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const platform = normalizeDeviceMetadataForAuth(params.platform);
  const deviceFamily = normalizeDeviceMetadataForAuth(params.deviceFamily);
  return [
    "v3",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily,
  ].join("|");
}
