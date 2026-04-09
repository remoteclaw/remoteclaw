// Gutted in RemoteClaw fork (Middleware Boundary Principle)
import type { RemoteClawConfig } from "../config/config.js";
type SecretResolveResult = { resolvedConfig: RemoteClawConfig; diagnostics: string[] };
export const resolveCommandSecretRefsViaGateway = async (
  params: { config: RemoteClawConfig; [key: string]: unknown },
  ..._rest: unknown[]
): Promise<SecretResolveResult> => {
  return { resolvedConfig: params.config, diagnostics: [] };
};
