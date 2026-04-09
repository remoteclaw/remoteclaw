// Gutted in RemoteClaw fork (Middleware Boundary Principle)
import type { GatewayRequestHandlerOptions } from "./types.js";

export const createExecApprovalHandlers = (..._args: unknown[]) => ({
  "exec.approval.request": async (_opts: GatewayRequestHandlerOptions) => {},
  "exec.approval.resolve": async (_opts: GatewayRequestHandlerOptions) => {},
});
