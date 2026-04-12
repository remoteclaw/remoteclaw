/* eslint-disable @typescript-eslint/no-explicit-any */
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export function shouldBypassAcpDispatchForCommand(..._args: unknown[]): boolean {
  return true;
}
export async function tryDispatchAcpReply(..._args: unknown[]): Promise<any> {
  return undefined;
}
