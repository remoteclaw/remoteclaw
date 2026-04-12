// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Only qrRemote target IDs restored — needed for gateway remote auth resolution.
export const getAgentRuntimeCommandSecretTargetIds = (..._args: unknown[]) => new Set<string>();
export function getQrRemoteCommandSecretTargetIds(): Set<string> {
  return new Set(["gateway.remote.token", "gateway.remote.password"]);
}
export const getChannelsCommandSecretTargetIds = (..._args: unknown[]) => new Set<string>();
export const getStatusCommandSecretTargetIds = (..._args: unknown[]) => new Set<string>();
