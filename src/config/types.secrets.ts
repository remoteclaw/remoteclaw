export type SecretRefSource = "env" | "file";

/**
 * Stable identifier for a secret in a configured source.
 * Examples:
 * - env source: "OPENAI_API_KEY"
 * - file source: "/providers/openai/api_key" (JSON pointer)
 */
export type SecretRef = {
  source: SecretRefSource;
  id: string;
};

export type SecretInput = string | SecretRef;
export const DEFAULT_SECRET_PROVIDER_ALIAS = "default";
export const ENV_SECRET_REF_ID_RE = /^[A-Z][A-Z0-9_]{0,127}$/;

export function isValidEnvSecretRefId(value: string): boolean {
  return ENV_SECRET_REF_ID_RE.test(value);
}

export type SecretsConfig = {
  sources?: {
    env?: EnvSecretSourceConfig;
    file?: SopsSecretSourceConfig;
  };
};

export function coerceSecretRef(value: unknown): SecretRef | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const rec = value as Record<string, unknown>;
  const source = typeof rec.source === "string" ? rec.source.trim().toLowerCase() : undefined;
  const id = typeof rec.id === "string" ? rec.id.trim() : undefined;
  if ((source === "env" || source === "file") && id) {
    return { source, id };
  }
  return null;
}

export function normalizeSecretInputString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}
