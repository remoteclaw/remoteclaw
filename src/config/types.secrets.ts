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

export type EnvSecretSourceConfig = {
  type?: "env";
};

export type SopsSecretSourceConfig = {
  type: "sops";
  path: string;
  timeoutMs?: number;
};

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

/**
 * Returns true if the value is a configured secret — either a non-empty
 * plaintext string or a well-formed SecretRef object.
 */
export function hasConfiguredSecretInput(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return coerceSecretRef(value) !== null;
}

export function normalizeSecretInputString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}
