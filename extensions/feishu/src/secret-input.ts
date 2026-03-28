export { buildSecretInputSchema } from "remoteclaw/plugin-sdk/feishu";
export { hasConfiguredSecretInput, normalizeSecretInputString } from "remoteclaw/plugin-sdk/feishu";

/**
 * Resolves a secret input value to a trimmed string, throwing if the value
 * is an unresolved SecretRef object (i.e. the runtime failed to resolve it).
 */
export function normalizeResolvedSecretInputString(params: {
  value: unknown;
  path: string;
}): string | undefined {
  if (params.value && typeof params.value === "object") {
    throw new Error(
      `Unresolved secret ref at ${params.path}: expected resolved string, got SecretRef object.`,
    );
  }
  if (typeof params.value !== "string") {
    return undefined;
  }
  const trimmed = params.value.trim();
  return trimmed || undefined;
}
