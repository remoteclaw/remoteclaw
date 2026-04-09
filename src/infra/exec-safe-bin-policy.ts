// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type SafeBinProfile = Record<string, unknown>;
export type SafeBinProfileFixture = Record<string, unknown>;
export function normalizeSafeBinProfileFixtures(
  _profiles: unknown,
): Record<string, SafeBinProfile> {
  return {};
}
