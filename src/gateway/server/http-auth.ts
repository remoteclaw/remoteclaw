import type { GatewayAuthResult } from "../auth.js";

// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export function authorizeCanvasRequest(..._args: unknown[]): GatewayAuthResult {
  return { ok: false, method: "none" } as GatewayAuthResult;
}
export function enforcePluginRouteGatewayAuth(..._args: unknown[]): GatewayAuthResult {
  return { ok: true, method: "none" } as GatewayAuthResult;
}
export function isCanvasPath(..._args: unknown[]): boolean {
  return false;
}
