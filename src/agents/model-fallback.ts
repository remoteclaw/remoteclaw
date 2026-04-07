// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Model fallback is not used — CLI agents manage their own models.

// oxlint-disable-next-line typescript/no-explicit-any
export async function runWithModelFallback(..._args: unknown[]): Promise<any> {
  return undefined;
}
