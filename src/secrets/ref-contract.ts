import {
  DEFAULT_SECRET_PROVIDER_ALIAS,
  isValidEnvSecretRefId,
  type SecretRef,
  type SecretRefSource,
} from "../config/types.secrets.js";

const FILE_SECRET_REF_SEGMENT_PATTERN = /^(?:[^~]|~0|~1)*$/;
export const SECRET_PROVIDER_ALIAS_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const EXEC_SECRET_REF_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

export const SINGLE_VALUE_FILE_REF_ID = "value";
export const FILE_SECRET_REF_ID_PATTERN = /^(?:value|\/(?:[^~]|~0|~1)*(?:\/(?:[^~]|~0|~1)*)*)$/;
export const EXEC_SECRET_REF_ID_JSON_SCHEMA_PATTERN =
  "^(?!.*(?:^|/)\\.{1,2}(?:/|$))[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$";

export type ExecSecretRefIdValidationReason = "pattern" | "traversal-segment";

export type ExecSecretRefIdValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: ExecSecretRefIdValidationReason;
    };

export type SecretRefDefaultsCarrier = {
  secrets?: {
    defaults?: {
      env?: string;
      file?: string;
      exec?: string;
    };
    providers?: Record<string, { source?: string }>;
  };
};

export function secretRefKey(ref: SecretRef): string {
  return `${ref.source}:${ref.provider}:${ref.id}`;
}

export function resolveDefaultSecretProviderAlias(
  config: SecretRefDefaultsCarrier,
  source: SecretRefSource,
  options?: { preferFirstProviderForSource?: boolean },
): string {
  const configured =
    source === "env"
      ? config.secrets?.defaults?.env
      : source === "file"
        ? config.secrets?.defaults?.file
        : config.secrets?.defaults?.exec;
  if (configured?.trim()) {
    return configured.trim();
  }

  if (options?.preferFirstProviderForSource) {
    const providers = config.secrets?.providers;
    if (providers) {
      for (const [providerName, provider] of Object.entries(providers)) {
        if (provider?.source === source) {
          return providerName;
        }
      }
    }
  }

  return DEFAULT_SECRET_PROVIDER_ALIAS;
}

export function isValidFileSecretRefId(value: string): boolean {
  if (value === SINGLE_VALUE_FILE_REF_ID) {
    return true;
  }
  if (!value.startsWith("/")) {
    return false;
  }
  return value
    .slice(1)
    .split("/")
    .every((segment) => FILE_SECRET_REF_SEGMENT_PATTERN.test(segment));
}

export function isValidSecretProviderAlias(value: string): boolean {
  return SECRET_PROVIDER_ALIAS_PATTERN.test(value);
}

export function validateExecSecretRefId(value: string): ExecSecretRefIdValidationResult {
  if (!EXEC_SECRET_REF_ID_PATTERN.test(value)) {
    return { ok: false, reason: "pattern" };
  }
  for (const segment of value.split("/")) {
    if (segment === "." || segment === "..") {
      return { ok: false, reason: "traversal-segment" };
    }
  }
  return { ok: true };
}

export function isValidExecSecretRefId(value: string): boolean {
  return validateExecSecretRefId(value).ok;
}

export function formatExecSecretRefIdValidationMessage(): string {
  return [
    "Exec secret reference id must match /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/",
    'and must not include "." or ".." path segments',
    '(example: "vault/openai/api-key").',
  ].join(" ");
}

export type SecretRefShapeValidationReason =
  | "env-id"
  | "file-id"
  | "exec-id-pattern"
  | "exec-id-traversal-segment";

export type SecretRefShapeValidationResult =
  | { ok: true }
  | { ok: false; reason: SecretRefShapeValidationReason; message: string };

/**
 * Validate that a structurally-coerced {@link SecretRef} carries a well-formed
 * per-source `id` before it is used to resolve a secret.
 *
 * `coerceSecretRef`/`isSecretRef` only guarantee that `source` is valid and
 * `provider`/`id` are non-empty strings — they do NOT apply the per-source id
 * patterns the config Zod schema enforces at load time (see
 * `src/config/zod-schema.core.ts`). A ref that bypasses schema validation
 * (inline-object coercion, legacy provider-less form, programmatic
 * construction) can therefore reach resolution with a malformed id that is
 * then handed straight to a provider: an exec id is written to the provider's
 * stdin payload, a file id navigates a JSON pointer / path, an env id is used
 * as an env-var name. This guard applies the same id validators the schema
 * uses, so a schema-valid ref always passes (zero drift, no false rejections)
 * while a malformed id — most importantly an exec id with a "." / ".."
 * traversal segment — is rejected before use.
 *
 * The `provider` alias is intentionally not validated here: it is only a
 * lookup key into the configured providers map (a malformed alias simply finds
 * no provider), never an input handed to a provider, and the resolution engine
 * treats it as a free-form key.
 */
export function validateSecretRefShape(ref: SecretRef): SecretRefShapeValidationResult {
  switch (ref.source) {
    case "env":
      if (!isValidEnvSecretRefId(ref.id)) {
        return {
          ok: false,
          reason: "env-id",
          message:
            'Env secret reference id must match /^[A-Z][A-Z0-9_]{0,127}$/ (example: "OPENAI_API_KEY").',
        };
      }
      return { ok: true };
    case "file":
      if (!isValidFileSecretRefId(ref.id)) {
        return {
          ok: false,
          reason: "file-id",
          message:
            'File secret reference id must be an absolute JSON pointer (example: "/providers/openai/apiKey"), or "value" for singleValue mode.',
        };
      }
      return { ok: true };
    case "exec": {
      const execResult = validateExecSecretRefId(ref.id);
      if (!execResult.ok) {
        return {
          ok: false,
          reason:
            execResult.reason === "traversal-segment"
              ? "exec-id-traversal-segment"
              : "exec-id-pattern",
          message: formatExecSecretRefIdValidationMessage(),
        };
      }
      return { ok: true };
    }
  }
}
