/**
 * Minimal secret input string resolver for RemoteClaw fork.
 *
 * The full secret-provider pipeline was gutted (Middleware Boundary Principle),
 * but config fields still carry SecretRef objects ({source, provider, id}) and
 * template strings ("${ENV_VAR}"). This stub handles the two common cases:
 *   1. Plain string values (returned as-is).
 *   2. SecretRef with source:"env" — resolved from process.env.
 *   3. Template strings like "${VAR}" — resolved from process.env.
 */
export async function resolveSecretInputString(params: {
  config?: unknown;
  value: unknown;
  env?: NodeJS.ProcessEnv;
  normalize?: (value: string) => string | undefined;
  onResolveRefError?: (error: unknown) => void;
}): Promise<string | undefined> {
  const { value, env = process.env, normalize } = params;
  if (value == null) {
    return undefined;
  }
  // Plain string (may be a template like "${VAR}")
  if (typeof value === "string") {
    let resolved = value;
    const templateMatch = /^\$\{([^}]+)\}$/.exec(value);
    if (templateMatch) {
      resolved = env[templateMatch[1]] ?? "";
    }
    return normalize ? normalize(resolved) : resolved || undefined;
  }
  // SecretRef object: { source: "env", provider: string, id: string }
  if (typeof value === "object" && value !== null) {
    const ref = value as Record<string, unknown>;
    if (ref.source === "env" && typeof ref.id === "string") {
      const resolved = env[ref.id] ?? "";
      return normalize ? normalize(resolved) : resolved || undefined;
    }
  }
  return undefined;
}
