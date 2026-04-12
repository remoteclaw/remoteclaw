/* eslint-disable @typescript-eslint/no-explicit-any */
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export function applyModelAllowlist(..._args: any[]): any {
  return _args[0];
}
export function applyModelFallbacksFromSelection(..._args: any[]): any {
  return _args[0];
}
export function applyPrimaryModel(..._args: any[]): any {
  return _args[0];
}
export async function promptDefaultModel(..._args: unknown[]): Promise<any> {
  return {};
}
export async function promptModelAllowlist(..._args: unknown[]): Promise<any> {
  return {};
}
