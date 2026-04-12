// Minimal implementation for RemoteClaw fork
export const NON_ENV_SECRETREF_MARKER = "__non_env__";

const OAUTH_API_KEY_MARKER_PREFIX = "oauth:";

export function isSecretRefHeaderValueMarker(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === NON_ENV_SECRETREF_MARKER || trimmed.startsWith("secretref-env:");
}

export function isNonSecretApiKeyMarker(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return (
    trimmed === NON_ENV_SECRETREF_MARKER ||
    trimmed.startsWith(OAUTH_API_KEY_MARKER_PREFIX) ||
    trimmed === "custom-local" ||
    trimmed === "ollama-local" ||
    trimmed === "gcp-vertex-credentials"
  );
}

export function isKnownEnvApiKeyMarker(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 && /^[A-Z][A-Z0-9_]+$/.test(trimmed) && !isNonSecretApiKeyMarker(trimmed)
  );
}
