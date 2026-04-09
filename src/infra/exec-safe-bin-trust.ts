// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export function normalizeTrustedSafeBinDirs(_dirs: unknown): string[] {
  return [];
}
export const getTrustedSafeBinDirs = (..._args: unknown[]): ReadonlySet<string> =>
  new Set<string>();
export const isTrustedSafeBinPath = (..._args: unknown[]) => true as boolean;
