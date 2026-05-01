import type { RemoteClawConfig } from "../../config/config.js";
import { resolveGatewayDriftCheckCredentialsFromConfig } from "../../gateway/credentials.js";

export function resolveGatewayTokenForDriftCheck(params: { cfg: RemoteClawConfig; env?: NodeJS.ProcessEnv }) {
  void params.env;
  return resolveGatewayDriftCheckCredentialsFromConfig({ cfg: params.cfg }).token;
}
