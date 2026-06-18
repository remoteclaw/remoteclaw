import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import { resolveSecretInputRef } from "../config/types.secrets.js";
import { secretRefKey, validateSecretRefShape } from "../secrets/ref-contract.js";
import { resolveSecretRefValues } from "../secrets/resolve.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";

export type SecretInputUnresolvedReasonStyle = "generic" | "detailed"; // pragma: allowlist secret
export type ConfiguredSecretInputSource =
  | "config"
  | "secretRef" // pragma: allowlist secret
  | "fallback";

function buildUnresolvedReason(params: {
  path: string;
  style: SecretInputUnresolvedReasonStyle;
  kind: "unresolved" | "non-string" | "empty" | "malformed";
  refLabel: string;
  detail?: string;
}): string {
  if (params.kind === "malformed") {
    if (params.style === "generic" || !params.detail) {
      return `${params.path} SecretRef is malformed (${params.refLabel}).`;
    }
    return `${params.path} SecretRef is malformed (${params.refLabel}): ${params.detail}`;
  }
  if (params.style === "generic") {
    return `${params.path} SecretRef is unresolved (${params.refLabel}).`;
  }
  if (params.kind === "non-string") {
    return `${params.path} SecretRef resolved to a non-string value.`;
  }
  if (params.kind === "empty") {
    return `${params.path} SecretRef resolved to an empty value.`;
  }
  return `${params.path} SecretRef is unresolved (${params.refLabel}).`;
}

export async function resolveConfiguredSecretInputString(params: {
  config: RemoteClawConfig;
  env: NodeJS.ProcessEnv;
  value: unknown;
  path: string;
  unresolvedReasonStyle?: SecretInputUnresolvedReasonStyle;
}): Promise<{ value?: string; unresolvedRefReason?: string }> {
  const style = params.unresolvedReasonStyle ?? "generic";
  const { ref } = resolveSecretInputRef({
    value: params.value,
    defaults: params.config.secrets?.defaults,
  });
  if (!ref) {
    return { value: normalizeOptionalString(params.value) };
  }

  const refLabel = `${ref.source}:${ref.provider}:${ref.id}`;

  // Pre-validate the SecretRef id shape before using it. `coerceSecretRef`
  // only guarantees a non-empty `id` string; a ref that bypassed the config
  // schema (inline coercion, legacy form, programmatic construction) can still
  // carry a malformed id that would otherwise be passed straight to a provider
  // (exec stdin, file/JSON navigation, env lookup).
  const shape = validateSecretRefShape(ref);
  if (!shape.ok) {
    return {
      unresolvedRefReason: buildUnresolvedReason({
        path: params.path,
        style,
        kind: "malformed",
        refLabel,
        detail: shape.message,
      }),
    };
  }

  try {
    const resolved = await resolveSecretRefValues([ref], {
      config: params.config,
      env: params.env,
    });
    const resolvedValue = resolved.get(secretRefKey(ref));
    if (typeof resolvedValue !== "string") {
      return {
        unresolvedRefReason: buildUnresolvedReason({
          path: params.path,
          style,
          kind: "non-string",
          refLabel,
        }),
      };
    }
    const trimmed = normalizeOptionalString(resolvedValue);
    if (!trimmed) {
      return {
        unresolvedRefReason: buildUnresolvedReason({
          path: params.path,
          style,
          kind: "empty",
          refLabel,
        }),
      };
    }
    return { value: trimmed };
  } catch {
    return {
      unresolvedRefReason: buildUnresolvedReason({
        path: params.path,
        style,
        kind: "unresolved",
        refLabel,
      }),
    };
  }
}

export async function resolveConfiguredSecretInputWithFallback(params: {
  config: RemoteClawConfig;
  env: NodeJS.ProcessEnv;
  value: unknown;
  path: string;
  unresolvedReasonStyle?: SecretInputUnresolvedReasonStyle;
  readFallback?: () => string | undefined;
}): Promise<{
  value?: string;
  source?: ConfiguredSecretInputSource;
  unresolvedRefReason?: string;
  secretRefConfigured: boolean;
}> {
  const { ref } = resolveSecretInputRef({
    value: params.value,
    defaults: params.config.secrets?.defaults,
  });
  const configValue = !ref ? normalizeOptionalString(params.value) : undefined;
  if (configValue) {
    return {
      value: configValue,
      source: "config",
      secretRefConfigured: false,
    };
  }
  if (!ref) {
    const fallback = params.readFallback?.();
    if (fallback) {
      return {
        value: fallback,
        source: "fallback",
        secretRefConfigured: false,
      };
    }
    return { secretRefConfigured: false };
  }

  const resolved = await resolveConfiguredSecretInputString({
    config: params.config,
    env: params.env,
    value: params.value,
    path: params.path,
    unresolvedReasonStyle: params.unresolvedReasonStyle,
  });
  if (resolved.value) {
    return {
      value: resolved.value,
      source: "secretRef",
      secretRefConfigured: true,
    };
  }

  const fallback = params.readFallback?.();
  if (fallback) {
    return {
      value: fallback,
      source: "fallback",
      secretRefConfigured: true,
    };
  }

  return {
    unresolvedRefReason: resolved.unresolvedRefReason,
    secretRefConfigured: true,
  };
}

export async function resolveRequiredConfiguredSecretRefInputString(params: {
  config: RemoteClawConfig;
  env: NodeJS.ProcessEnv;
  value: unknown;
  path: string;
  unresolvedReasonStyle?: SecretInputUnresolvedReasonStyle;
}): Promise<string | undefined> {
  const { ref } = resolveSecretInputRef({
    value: params.value,
    defaults: params.config.secrets?.defaults,
  });
  if (!ref) {
    return undefined;
  }

  const resolved = await resolveConfiguredSecretInputString({
    config: params.config,
    env: params.env,
    value: params.value,
    path: params.path,
    unresolvedReasonStyle: params.unresolvedReasonStyle,
  });
  if (resolved.value) {
    return resolved.value;
  }
  throw new Error(resolved.unresolvedRefReason ?? `${params.path} resolved to an empty value.`);
}
