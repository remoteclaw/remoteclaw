export type SecretRefSource = "env" | "file" | "exec";

/**
 * Stable identifier for a secret in a configured source.
 * Examples:
 * - env source: "OPENAI_API_KEY"
 * - file source: "/providers/openai/api_key" (JSON pointer)
 * - exec source: "vault/openai/api-key"
 */
export type SecretRef = {
  source: SecretRefSource;
  id: string;
  provider?: string;
};

export const DEFAULT_SECRET_PROVIDER_ALIAS = "default";

/**
 * Regex for validating env-source secret ref IDs.
 * Matches uppercase identifiers like "OPENAI_API_KEY".
 */
export const ENV_SECRET_REF_ID_RE = /^[A-Z][A-Z0-9_]{0,127}$/;

export type ExecSecretProviderConfig = {
  source: "exec";
  command: string;
  args?: string[];
  timeoutMs?: number;
  jsonOnly?: boolean;
};

export type FileSecretProviderConfig = {
  source: "file";
  path: string;
  mode?: "json" | "singleValue";
  timeoutMs?: number;
  maxBytes?: number;
};

export type EnvSecretProviderConfig = {
  source: "env";
  allowlist?: string[];
};

export type SecretProviderConfig =
  | EnvSecretProviderConfig
  | FileSecretProviderConfig
  | ExecSecretProviderConfig;

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
  defaults?: {
    env?: string;
    file?: string;
    exec?: string;
  };
  providers?: Record<string, SecretProviderConfig>;
};

export function coerceSecretRef(value: unknown): SecretRef | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const rec = value as Record<string, unknown>;
  const source = typeof rec.source === "string" ? rec.source.trim().toLowerCase() : undefined;
  const id = typeof rec.id === "string" ? rec.id.trim() : undefined;
  const provider = typeof rec.provider === "string" ? rec.provider.trim() : undefined;
  if ((source === "env" || source === "file" || source === "exec") && id) {
    return { source, id, ...(provider ? { provider } : {}) };
  }
  return null;
}

/**
 * Resolves a SecretInput value into a structured result with optional defaults.
 */
export function resolveSecretInputRef(params: {
  value: unknown;
  defaults?: { env?: string; file?: string; exec?: string };
}): { ref: SecretRef | null } {
  const ref = coerceSecretRef(params.value);
  if (ref) {
    if (!ref.provider && params.defaults) {
      const defaultProvider =
        ref.source === "env"
          ? params.defaults.env
          : ref.source === "file"
            ? params.defaults.file
            : params.defaults.exec;
      if (defaultProvider) {
        ref.provider = defaultProvider;
      }
    }
    return { ref };
  }
  return { ref: null };
}

/**
 * Returns true if the value is a configured secret — either a non-empty
 * plaintext string or a well-formed SecretRef object.
 */
export function hasConfiguredSecretInput(
  value: unknown,
  _defaults?: { env?: string; file?: string; exec?: string },
): boolean {
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
