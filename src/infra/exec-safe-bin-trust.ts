// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Minimal stub: preserves security audit detection of risky trusted dirs.
export function normalizeTrustedSafeBinDirs(entries?: readonly string[] | null): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }
  const normalized = entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return Array.from(new Set(normalized));
}
export const getTrustedSafeBinDirs = (..._args: unknown[]) => new Set<string>();
export const isTrustedSafeBinPath = (..._args: unknown[]) => false;
