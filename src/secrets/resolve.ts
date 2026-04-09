// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Minimal env-source resolution for CLI commands that resolve SecretRefs
export const resolveSecretRefValues = (
  refs: Array<{ source?: string; id?: string; provider?: string }>,
  opts?: { env?: Record<string, string | undefined>; config?: unknown },
): Promise<Map<string, unknown>> => {
  const result = new Map<string, unknown>();
  const env = opts?.env ?? process.env;
  for (const ref of refs ?? []) {
    if (ref.source === "env" && typeof ref.id === "string") {
      const key = `${ref.source}:${ref.provider ?? "default"}:${ref.id}`;
      const value = env[ref.id];
      if (value !== undefined) {
        result.set(key, value);
      }
    }
  }
  return Promise.resolve(result);
};
export const resolveSecretRefString = (..._args: unknown[]) =>
  Promise.resolve(undefined as string | undefined);
export const resolveSecretValue = (..._args: unknown[]) => undefined as unknown;
export const resolveSecretRef = (..._args: unknown[]) => undefined as unknown;
export const resolveAllSecrets = (..._args: unknown[]) => undefined as unknown;
