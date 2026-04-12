// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export function makeToolPrunablePredicate(..._args: unknown[]): (..._a: unknown[]) => boolean {
  return () => false;
}
