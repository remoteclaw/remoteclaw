// Stub — new upstream module (v2026.3.2)
import type { RemoteClawConfig } from "./config.js";

export function resolveGatewayControlUiOrigins(_cfg: RemoteClawConfig): string[] {
  return [];
}

export function ensureControlUiAllowedOriginsForNonLoopbackBind(
  config: unknown,
  ..._rest: unknown[]
): { config: typeof config } {
  return { config };
}
